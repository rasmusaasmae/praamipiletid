import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { tickets, tripOptions, trips } from '@/db/schema'
import {
  commitZeroSum,
  editTicket,
  getBooking,
  getBookingBalance,
  PraamidAuthError,
  type Ticket as PraamidTicket,
} from '@/lib/praamid-authed'
import { listEvents, type PraamidEvent } from '@/lib/praamid'
import {
  getCredential,
  invalidateCredential,
  markVerified,
} from '@/lib/praamid-credentials'
import { getAllSettings } from '@/lib/settings'
import { logAudit } from '@/lib/audit'

const CREDENTIAL_BUFFER_MS = 15 * 60 * 1000
const TRIP_BACKOFF_MS = 10 * 60 * 1000

// Process-local backoff. Resets on app restart — acceptable for v1.
const lastAttemptAt = new Map<string, number>()

type FailStage = 'put' | 'balance' | 'commit' | 'auth' | 'idempotency' | 'internal'

export type EditOutcome =
  | { kind: 'no_target' }
  | { kind: 'gate_blocked'; reason: string }
  | { kind: 'idempotency_paused'; reason: string }
  | { kind: 'failed'; stage: FailStage; reason: string }
  | { kind: 'rolled_back'; reason: string }
  | {
      kind: 'succeeded'
      newTicketCode: string
      newTicketNumber: string
      invoiceNumber: string
    }

export async function processEditForTrip(tripId: string): Promise<EditOutcome> {
  const { editGloballyEnabled } = await getAllSettings()
  if (!editGloballyEnabled) {
    return { kind: 'gate_blocked', reason: 'edit_disabled' }
  }

  const trip = await db
    .select({
      id: trips.id,
      userId: trips.userId,
      direction: trips.direction,
      edit: trips.edit,
      active: trips.active,
    })
    .from(trips)
    .where(eq(trips.id, tripId))
    .get()
  if (!trip) return { kind: 'gate_blocked', reason: 'trip_missing' }
  if (!trip.edit || !trip.active) {
    return { kind: 'gate_blocked', reason: 'trip_not_eligible' }
  }

  const ticket = await db
    .select({
      ticketCode: tickets.ticketCode,
      ticketNumber: tickets.ticketNumber,
      bookingUid: tickets.bookingUid,
      eventUid: tickets.eventUid,
    })
    .from(tickets)
    .where(eq(tickets.tripId, tripId))
    .get()
  if (!ticket) return { kind: 'gate_blocked', reason: 'no_ticket' }

  const credential = await getCredential(trip.userId)
  if (!credential) return { kind: 'gate_blocked', reason: 'no_credential' }
  if (credential.expiresAt.getTime() < Date.now() + CREDENTIAL_BUFFER_MS) {
    return { kind: 'gate_blocked', reason: 'credential_expiring' }
  }

  const last = lastAttemptAt.get(tripId) ?? 0
  if (Date.now() - last < TRIP_BACKOFF_MS) {
    return { kind: 'gate_blocked', reason: 'backoff' }
  }

  const options = await db
    .select({
      id: tripOptions.id,
      priority: tripOptions.priority,
      eventUid: tripOptions.eventUid,
      eventDate: tripOptions.eventDate,
      eventDtstart: tripOptions.eventDtstart,
      stopBeforeMinutes: tripOptions.stopBeforeMinutes,
      lastCapacity: tripOptions.lastCapacity,
      lastCapacityState: tripOptions.lastCapacityState,
    })
    .from(tripOptions)
    .where(and(eq(tripOptions.tripId, tripId), eq(tripOptions.active, true)))
    .all()

  const now = Date.now()
  const currentOption = options.find((o) => o.eventUid === ticket.eventUid)
  const currentPriority = currentOption?.priority ?? Number.POSITIVE_INFINITY

  const target = options
    .filter((o) => o.eventUid !== ticket.eventUid)
    .filter((o) => o.eventDtstart.getTime() - o.stopBeforeMinutes * 60_000 > now)
    .filter(
      (o) => o.lastCapacityState === 'above' && (o.lastCapacity ?? 0) >= 1,
    )
    .filter((o) => o.priority < currentPriority)
    .sort((a, b) => a.priority - b.priority)[0]

  if (!target) return { kind: 'no_target' }

  lastAttemptAt.set(tripId, Date.now())
  await logAudit({
    type: 'edit.attempted',
    actor: 'system',
    userId: trip.userId,
    tripId,
    payload: {
      fromEventUid: ticket.eventUid,
      toEventUid: target.eventUid,
      toPriority: target.priority,
      ticketCode: ticket.ticketCode,
      targetEventDtstart: target.eventDtstart.getTime(),
    },
  })

  const fail = async (
    stage: FailStage,
    reason: string,
    httpStatus?: number,
    errorMessage?: string,
  ): Promise<EditOutcome> => {
    await logAudit({
      type: 'edit.failed',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { stage, reason, ...(httpStatus !== undefined ? { httpStatus } : {}), ...(errorMessage ? { errorMessage } : {}) },
    })
    return { kind: 'failed', stage, reason }
  }

  let booking
  try {
    booking = await getBooking(credential.token, ticket.bookingUid)
    await markVerified(trip.userId)
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(trip.userId, `getBooking ${err.status}`)
      return fail('auth', 'auth_failed', err.status, err.message)
    }
    return fail('idempotency', 'get_booking_failed', undefined, err instanceof Error ? err.message : String(err))
  }

  const oldTicket = booking.tickets.find((t) => t.ticketCode === ticket.ticketCode)
  if (!oldTicket) {
    await logAudit({
      type: 'edit.failed',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { stage: 'idempotency', reason: 'ticket_missing' },
    })
    return { kind: 'idempotency_paused', reason: 'ticket_missing' }
  }
  if (oldTicket.status.code !== 'ACTIVE') {
    await logAudit({
      type: 'edit.failed',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { stage: 'idempotency', reason: `ticket_status_${oldTicket.status.code}` },
    })
    return { kind: 'idempotency_paused', reason: `ticket_status_${oldTicket.status.code}` }
  }

  let events: PraamidEvent[]
  try {
    events = await listEvents(trip.direction, target.eventDate)
  } catch (err) {
    return fail('internal', 'list_events_failed', undefined, err instanceof Error ? err.message : String(err))
  }
  const targetEvent = events.find((e) => e.uid === target.eventUid)
  if (!targetEvent) {
    return fail('internal', 'target_event_missing')
  }

  const patchedBody = patchTicketEvent(oldTicket, targetEvent)

  try {
    await editTicket(credential.token, ticket.ticketCode, patchedBody)
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(trip.userId, `editTicket ${err.status}`)
      return fail('auth', 'auth_failed', err.status, err.message)
    }
    const status = err instanceof PraamidAuthError ? err.status : undefined
    return fail('put', 'put_failed', status, err instanceof Error ? err.message : String(err))
  }

  let balance
  try {
    balance = await getBookingBalance(credential.token, ticket.bookingUid)
  } catch (err) {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    await logAudit({
      type: 'edit.rolled_back',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { reason: err instanceof Error ? `balance_${err.message}` : 'balance_failed' },
    })
    return { kind: 'rolled_back', reason: 'balance_failed' }
  }
  if (balance.unpaidAmount > 0) {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    await logAudit({
      type: 'edit.rolled_back',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { reason: `unpaid_${balance.unpaidAmount}` },
    })
    return { kind: 'rolled_back', reason: `unpaid_${balance.unpaidAmount}` }
  }

  let commitResult
  try {
    commitResult = await commitZeroSum(credential.token, ticket.bookingUid)
  } catch (err) {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    await logAudit({
      type: 'edit.rolled_back',
      actor: 'system',
      userId: trip.userId,
      tripId,
      payload: { reason: err instanceof Error ? `commit_${err.message}` : 'commit_failed' },
    })
    return { kind: 'rolled_back', reason: 'commit_failed' }
  }

  let updated
  try {
    updated = await getBooking(credential.token, ticket.bookingUid)
  } catch (err) {
    return fail('internal', 'post_commit_get_booking_failed', undefined, err instanceof Error ? err.message : String(err))
  }

  const newTicket = updated.tickets.find(
    (t) => t.parentTicketId === oldTicket.id && t.status.code === 'ACTIVE',
  )
  if (!newTicket) return fail('internal', 'new_ticket_not_found')

  db.transaction((tx) => {
    tx.update(tickets)
      .set({
        ticketCode: newTicket.ticketCode,
        ticketNumber: newTicket.ticketNumber,
        bookingUid: newTicket.bookingUid,
        eventUid: newTicket.event.uid,
        ticketDate: newTicket.ticketDate,
        eventDtstart: new Date(newTicket.event.dtstart),
        capturedAt: new Date(),
      })
      .where(eq(tickets.tripId, tripId))
      .run()
    tx.update(tripOptions)
      .set({ active: false })
      .where(eq(tripOptions.id, target.id))
      .run()
  })

  await logAudit({
    type: 'edit.succeeded',
    actor: 'system',
    userId: trip.userId,
    tripId,
    payload: {
      newTicketCode: newTicket.ticketCode,
      newTicketNumber: newTicket.ticketNumber,
      newInvoiceNumber: commitResult.invoiceNumber,
      fromEventUid: ticket.eventUid,
      toEventUid: newTicket.event.uid,
      toPriority: target.priority,
    },
  })

  return {
    kind: 'succeeded',
    newTicketCode: newTicket.ticketCode,
    newTicketNumber: newTicket.ticketNumber,
    invoiceNumber: commitResult.invoiceNumber,
  }
}

function patchTicketEvent(
  oldTicket: PraamidTicket,
  newEvent: PraamidEvent,
): PraamidTicket {
  return {
    ...oldTicket,
    event: {
      ...oldTicket.event,
      uid: newEvent.uid,
      dtstart: newEvent.dtstart,
      dtend: newEvent.dtend,
      ship: { ...oldTicket.event.ship, code: newEvent.ship.code },
      transportationType: {
        ...oldTicket.event.transportationType,
        code: newEvent.transportationType.code,
      },
      capacities: newEvent.capacities,
      status: newEvent.status,
      ...(newEvent.highPrice !== undefined ? { highPrice: newEvent.highPrice } : {}),
      ...(newEvent.pricelist
        ? {
            pricelist: {
              ...oldTicket.event.pricelist,
              code: newEvent.pricelist.code,
            },
          }
        : {}),
    },
  }
}

async function tryRollback(
  token: string,
  ticketCode: string,
  originalTicket: PraamidTicket,
): Promise<void> {
  try {
    await editTicket(token, ticketCode, originalTicket)
  } catch {
    // Best-effort. Praamid's 15-min draft TTL reverts server-side.
  }
}

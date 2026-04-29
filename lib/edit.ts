import 'server-only'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { logger } from '@/lib/logger'
import {
  commitZeroSum,
  editTicket,
  getBooking,
  getBookingBalance,
  PraamidAuthError,
} from '@/lib/praamid/api'
import { getCredential, invalidateCredential, markVerified } from '@/lib/praamid/credentials'
import type { PraamidEvent, Ticket as PraamidTicket } from '@/lib/praamid/types'
import { syncTicketsForUser } from '@/lib/sync-tickets'

const log = logger.child({ scope: 'edit' })

const CREDENTIAL_BUFFER_MS = 15 * 60 * 1000
const BOOKING_BACKOFF_MS = 10 * 60 * 1000

// Process-local backoff keyed by ticketId. Resets on app restart —
// acceptable for v1.
const lastAttemptAt = new Map<number, number>()

type FailStage = 'put' | 'balance' | 'commit' | 'auth' | 'idempotency' | 'internal'

export type SwapOutcome =
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

export type SwapInput = {
  userId: string
  ticketId: number
  openedEventUids: Set<string>
  eventsByUid: Map<string, PraamidEvent>
}

export async function processSwapFor(input: SwapInput): Promise<SwapOutcome> {
  log.debug({ ticketId: input.ticketId }, 'start')
  const outcome = await runSwap(input)
  if (outcome.kind === 'succeeded') {
    log.info(
      {
        ticketId: input.ticketId,
        newTicketNumber: outcome.newTicketNumber,
        invoiceNumber: outcome.invoiceNumber,
      },
      'succeeded',
    )
  } else if (outcome.kind === 'failed') {
    log.error({ ticketId: input.ticketId, stage: outcome.stage, reason: outcome.reason }, 'failed')
  } else if (outcome.kind === 'rolled_back') {
    log.warn({ ticketId: input.ticketId, reason: outcome.reason }, 'rolled_back')
  } else if (outcome.kind === 'idempotency_paused') {
    log.warn({ ticketId: input.ticketId, reason: outcome.reason }, 'idempotency_paused')
  } else {
    log.debug(
      {
        ticketId: input.ticketId,
        ...('reason' in outcome ? { reason: outcome.reason } : {}),
      },
      outcome.kind,
    )
  }
  return outcome
}

async function runSwap(input: SwapInput): Promise<SwapOutcome> {
  const { userId, ticketId, openedEventUids, eventsByUid } = input

  const [ticket] = await db
    .select({
      id: tickets.id,
      ticketCode: tickets.ticketCode,
      ticketNumber: tickets.ticketNumber,
      bookingUid: tickets.bookingUid,
      eventUid: tickets.eventUid,
      direction: tickets.direction,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!ticket) return { kind: 'gate_blocked', reason: 'ticket_missing' }

  const credential = await getCredential(userId)
  if (!credential) return { kind: 'gate_blocked', reason: 'no_credential' }
  if (credential.expiresAt.getTime() < Date.now() + CREDENTIAL_BUFFER_MS) {
    return { kind: 'gate_blocked', reason: 'credential_expiring' }
  }

  const last = lastAttemptAt.get(ticketId) ?? 0
  if (Date.now() - last < BOOKING_BACKOFF_MS) {
    return { kind: 'gate_blocked', reason: 'backoff' }
  }

  const options = await db
    .select({
      id: ticketOptions.id,
      priority: ticketOptions.priority,
      eventUid: ticketOptions.eventUid,
      eventDate: ticketOptions.eventDate,
      eventDtstart: ticketOptions.eventDtstart,
      stopBeforeMinutes: ticketOptions.stopBeforeMinutes,
    })
    .from(ticketOptions)
    .where(eq(ticketOptions.ticketId, ticketId))

  const now = Date.now()
  const currentOption = options.find((o) => o.eventUid === ticket.eventUid)
  const currentPriority = currentOption?.priority ?? Number.POSITIVE_INFINITY

  const target = options
    .filter((o) => o.eventUid !== ticket.eventUid)
    .filter((o) => openedEventUids.has(o.eventUid))
    .filter((o) => o.eventDtstart.getTime() - o.stopBeforeMinutes * 60_000 > now)
    .filter((o) => o.priority < currentPriority)
    .sort((a, b) => a.priority - b.priority)[0]

  if (!target) {
    log.debug(
      {
        ticketId,
        currentPriority: Number.isFinite(currentPriority) ? currentPriority : null,
        consideredCount: options.length,
      },
      'no_target',
    )
    return { kind: 'no_target' }
  }

  const targetEvent = eventsByUid.get(target.eventUid)
  if (!targetEvent) {
    return { kind: 'failed', stage: 'internal', reason: 'target_event_missing' }
  }

  log.info(
    {
      ticketId,
      fromEventUid: ticket.eventUid,
      toEventUid: target.eventUid,
      toPriority: target.priority,
      currentPriority: Number.isFinite(currentPriority) ? currentPriority : null,
    },
    'attempting',
  )
  lastAttemptAt.set(ticketId, Date.now())

  const fail = (
    stage: FailStage,
    reason: string,
    _httpStatus?: number,
    _errorMessage?: string,
  ): SwapOutcome => ({ kind: 'failed', stage, reason })

  const bookingUid = ticket.bookingUid
  let booking
  try {
    booking = await getBooking(credential.token, bookingUid)
    await markVerified(userId)
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `getBooking ${err.status}`)
      return fail('auth', 'auth_failed', err.status, err.message)
    }
    return fail(
      'idempotency',
      'get_booking_failed',
      undefined,
      err instanceof Error ? err.message : String(err),
    )
  }

  const oldTicket = booking.tickets.find((t) => t.ticketCode === ticket.ticketCode)
  if (!oldTicket) {
    return { kind: 'idempotency_paused', reason: 'ticket_missing' }
  }
  if (oldTicket.status.code !== 'ACTIVE') {
    return { kind: 'idempotency_paused', reason: `ticket_status_${oldTicket.status.code}` }
  }

  const patchedBody = patchTicketEvent(oldTicket, targetEvent)

  try {
    await editTicket(credential.token, ticket.ticketCode, patchedBody)
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `editTicket ${err.status}`)
      return fail('auth', 'auth_failed', err.status, err.message)
    }
    const status = err instanceof PraamidAuthError ? err.status : undefined
    return fail('put', 'put_failed', status, err instanceof Error ? err.message : String(err))
  }

  let balance
  try {
    balance = await getBookingBalance(credential.token, bookingUid)
  } catch {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    return { kind: 'rolled_back', reason: 'balance_failed' }
  }
  if (balance.unpaidAmount > 0) {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    return { kind: 'rolled_back', reason: `unpaid_${balance.unpaidAmount}` }
  }

  let commitResult
  try {
    commitResult = await commitZeroSum(credential.token, bookingUid)
  } catch {
    await tryRollback(credential.token, ticket.ticketCode, oldTicket)
    return { kind: 'rolled_back', reason: 'commit_failed' }
  }

  let updated
  try {
    updated = await getBooking(credential.token, bookingUid)
  } catch (err) {
    return fail(
      'internal',
      'post_commit_get_booking_failed',
      undefined,
      err instanceof Error ? err.message : String(err),
    )
  }

  const newTicket = updated.tickets.find(
    (t) => t.parentTicketId === oldTicket.id && t.status.code === 'ACTIVE',
  )
  if (!newTicket) return fail('internal', 'new_ticket_not_found')

  // Fold the swap into the local mirror: the new ticket gets inserted,
  // ticket_options migrate via parentTicketId-rewire, the just-used option
  // (and anything worse) gets pruned, the old ticket id is dropped.
  await syncTicketsForUser(userId)

  lastAttemptAt.delete(ticketId)

  return {
    kind: 'succeeded',
    newTicketCode: newTicket.ticketCode,
    newTicketNumber: newTicket.ticketNumber,
    invoiceNumber: commitResult.invoiceNumber,
  }
}

function patchTicketEvent(oldTicket: PraamidTicket, newEvent: PraamidEvent): PraamidTicket {
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

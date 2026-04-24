'use server'

import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import {
  getCredential,
  invalidateCredential,
  markVerified,
} from '@/lib/praamid-credentials'
import {
  listTickets,
  PraamidAuthError,
  type Ticket as PraamidTicket,
} from '@/lib/praamid-authed'
import { listEvents } from '@/lib/praamid'
import { logAudit } from '@/lib/audit'
import {
  optionAddSchema,
  optionMoveSchema,
  optionUpdateSchema,
  subscribeTicketSchema,
  unsubscribeTicketSchema,
} from '@/lib/schemas'
import { requireUser } from '@/lib/session'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'actions/tickets' })

const DEFAULT_MEASUREMENT_UNIT = 'sv'
const DEFAULT_STOP_BEFORE_MINUTES = 60

export type LiveTicket = {
  ticketCode: string
  ticketNumber: string
  ticketDate: string
  bookingUid: string
  eventUid: string
  eventDtstart: string
  direction: string
}

async function fetchPraamidTickets(
  userId: string,
  errT: Awaited<ReturnType<typeof getTranslations<'Errors'>>>,
): Promise<PraamidTicket[]> {
  const credential = await getCredential(userId)
  if (!credential) throw new Error(errT('noCredential'))
  if (credential.expiresAt.getTime() <= Date.now()) {
    throw new Error(errT('credentialExpired'))
  }
  try {
    const rawTickets = await listTickets(credential.token)
    await markVerified(userId)
    return rawTickets
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `listTickets ${err.status}`)
      throw new Error(errT('credentialExpired'))
    }
    throw new Error(errT('praamidError'))
  }
}

// Returns the user's active, future-dated tickets on praamid.ee. The home
// page calls this every render; if praamid auth is missing/expired we
// silently return [] rather than throwing — callers decide how to prompt
// the user to (re-)authenticate via the settings page.
export async function refreshTickets(): Promise<LiveTicket[]> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')
  let raw: PraamidTicket[]
  try {
    raw = await fetchPraamidTickets(session.user.id, errT)
  } catch (err) {
    log.debug(
      { userId: session.user.id, err: err instanceof Error ? err.message : String(err) },
      'refreshTickets skipped',
    )
    return []
  }
  const now = Date.now()
  return raw
    .filter((t) => t.status.code === 'ACTIVE')
    .filter((t) => {
      const ts = Date.parse(t.event.dtstart)
      return !Number.isNaN(ts) && ts > now
    })
    .map<LiveTicket>((t) => ({
      ticketCode: t.ticketCode,
      ticketNumber: t.ticketNumber,
      ticketDate: t.ticketDate,
      bookingUid: t.bookingUid,
      eventUid: t.event.uid,
      eventDtstart: t.event.dtstart,
      direction: t.direction.code,
    }))
    .sort((a, b) => Date.parse(a.eventDtstart) - Date.parse(b.eventDtstart))
}

export async function subscribeTicket(
  dto: z.input<typeof subscribeTicketSchema>,
): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = subscribeTicketSchema.safeParse(dto)
  if (!parsed.success) throw new Error(errT('invalidData'))

  const fetched = await fetchPraamidTickets(session.user.id, errT)
  const raw = fetched.find(
    (t) => t.bookingUid === parsed.data.bookingUid && t.ticketCode === parsed.data.ticketCode,
  )
  if (!raw) throw new Error(errT('ticketNotFound'))

  const eventDtstart = new Date(raw.event.dtstart)
  if (Number.isNaN(eventDtstart.getTime())) {
    throw new Error(errT('invalidData'))
  }

  const now = new Date()
  await db
    .insert(tickets)
    .values({
      userId: session.user.id,
      bookingUid: raw.bookingUid,
      ticketId: raw.id,
      ticketCode: raw.ticketCode,
      ticketNumber: raw.ticketNumber,
      direction: raw.direction.code,
      measurementUnit: DEFAULT_MEASUREMENT_UNIT,
      eventUid: raw.event.uid,
      eventDtstart,
      ticketDate: raw.ticketDate,
      capturedAt: now,
    })
    .onConflictDoUpdate({
      target: [tickets.userId, tickets.bookingUid],
      set: {
        ticketId: raw.id,
        ticketCode: raw.ticketCode,
        ticketNumber: raw.ticketNumber,
        direction: raw.direction.code,
        eventUid: raw.event.uid,
        eventDtstart,
        ticketDate: raw.ticketDate,
        capturedAt: now,
      },
    })

  await logAudit({
    type: 'ticket.subscribed',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: raw.bookingUid,
      ticketCode: raw.ticketCode,
      eventUid: raw.event.uid,
    },
  })
  log.info(
    { userId: session.user.id, bookingUid: raw.bookingUid, ticketCode: raw.ticketCode },
    'ticket subscribed',
  )

  revalidatePath('/')
}

export async function unsubscribeTicket(
  dto: z.input<typeof unsubscribeTicketSchema>,
): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = unsubscribeTicketSchema.safeParse(dto)
  if (!parsed.success) throw new Error(errT('missingId'))

  const [existing] = await db
    .select({ ticketCode: tickets.ticketCode })
    .from(tickets)
    .where(
      and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, parsed.data.bookingUid)),
    )
    .limit(1)
  if (!existing) throw new Error(errT('ticketNotFound'))

  await db
    .delete(tickets)
    .where(
      and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, parsed.data.bookingUid)),
    )

  await logAudit({
    type: 'ticket.unsubscribed',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: parsed.data.bookingUid,
      ticketCode: existing.ticketCode,
      reason: 'user',
    },
  })
  log.info(
    { userId: session.user.id, bookingUid: parsed.data.bookingUid },
    'ticket unsubscribed',
  )

  revalidatePath('/')
}

export async function addOption(dto: z.input<typeof optionAddSchema>): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = optionAddSchema.safeParse(dto)
  if (!parsed.success) throw new Error(errT('invalidData'))

  const [ticket] = await db
    .select({
      bookingUid: tickets.bookingUid,
      direction: tickets.direction,
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.userId, session.user.id),
        eq(tickets.bookingUid, parsed.data.bookingUid),
      ),
    )
    .limit(1)
  if (!ticket) throw new Error(errT('ticketNotFound'))

  const events = await listEvents(ticket.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) throw new Error(errT('eventNotFound'))

  const [duplicate] = await db
    .select({ id: ticketOptions.id })
    .from(ticketOptions)
    .where(
      and(
        eq(ticketOptions.bookingUid, ticket.bookingUid),
        eq(ticketOptions.eventUid, parsed.data.eventUid),
      ),
    )
    .limit(1)
  if (duplicate) throw new Error(errT('optionExists'))

  const [top] = await db
    .select({ priority: ticketOptions.priority })
    .from(ticketOptions)
    .where(eq(ticketOptions.bookingUid, ticket.bookingUid))
    .orderBy(desc(ticketOptions.priority))
    .limit(1)
  const nextPriority = (top?.priority ?? 0) + 1

  const stopBeforeMinutes = parsed.data.stopBeforeMinutes ?? DEFAULT_STOP_BEFORE_MINUTES

  const optionId = randomUUID()
  await db.insert(ticketOptions).values({
    id: optionId,
    userId: session.user.id,
    bookingUid: ticket.bookingUid,
    priority: nextPriority,
    eventUid: parsed.data.eventUid,
    eventDate: parsed.data.date,
    eventDtstart: new Date(event.dtstart),
    stopBeforeMinutes,
  })

  await logAudit({
    type: 'option.added',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: ticket.bookingUid,
      eventUid: parsed.data.eventUid,
      priority: nextPriority,
    },
  })
  log.info(
    {
      bookingUid: ticket.bookingUid,
      userId: session.user.id,
      eventUid: parsed.data.eventUid,
      priority: nextPriority,
    },
    'option added',
  )

  revalidatePath('/')
}

export async function updateOption(dto: z.input<typeof optionUpdateSchema>): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')
  const parsed = optionUpdateSchema.safeParse(dto)
  if (!parsed.success) throw new Error(errT('invalidData'))

  const [owned] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      eventUid: ticketOptions.eventUid,
    })
    .from(ticketOptions)
    .where(
      and(
        eq(ticketOptions.id, parsed.data.id),
        eq(ticketOptions.userId, session.user.id),
      ),
    )
    .limit(1)
  if (!owned) throw new Error(errT('optionNotFound'))

  await db
    .update(ticketOptions)
    .set({ stopBeforeMinutes: parsed.data.stopBeforeMinutes })
    .where(eq(ticketOptions.id, parsed.data.id))

  await logAudit({
    type: 'option.updated',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: owned.bookingUid,
      eventUid: owned.eventUid,
      stopBeforeMinutes: parsed.data.stopBeforeMinutes,
    },
  })
  log.info(
    {
      optionId: parsed.data.id,
      userId: session.user.id,
      stopBeforeMinutes: parsed.data.stopBeforeMinutes,
    },
    'option updated',
  )

  revalidatePath('/')
}

const RemoveOptionDto = z.object({ id: z.string().min(1) })

export async function removeOption(
  dto: z.input<typeof RemoveOptionDto>,
): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')
  const parsed = RemoveOptionDto.safeParse(dto)
  if (!parsed.success) throw new Error(errT('missingId'))

  const [existing] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      eventUid: ticketOptions.eventUid,
      priority: ticketOptions.priority,
    })
    .from(ticketOptions)
    .where(
      and(
        eq(ticketOptions.id, parsed.data.id),
        eq(ticketOptions.userId, session.user.id),
      ),
    )
    .limit(1)
  if (!existing) throw new Error(errT('optionNotFound'))

  await db.delete(ticketOptions).where(eq(ticketOptions.id, parsed.data.id))

  await logAudit({
    type: 'option.removed',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: existing.bookingUid,
      eventUid: existing.eventUid,
      priority: existing.priority,
    },
  })
  log.info(
    {
      optionId: parsed.data.id,
      bookingUid: existing.bookingUid,
      userId: session.user.id,
      priority: existing.priority,
    },
    'option removed',
  )

  revalidatePath('/')
}

export async function moveOption(dto: z.input<typeof optionMoveSchema>): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')
  const parsed = optionMoveSchema.safeParse(dto)
  if (!parsed.success) throw new Error(errT('invalidData'))

  const [current] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      priority: ticketOptions.priority,
      eventUid: ticketOptions.eventUid,
    })
    .from(ticketOptions)
    .where(
      and(
        eq(ticketOptions.id, parsed.data.id),
        eq(ticketOptions.userId, session.user.id),
      ),
    )
    .limit(1)
  if (!current) throw new Error(errT('optionNotFound'))

  const neighborFilter =
    parsed.data.direction === 'up'
      ? lt(ticketOptions.priority, current.priority)
      : gt(ticketOptions.priority, current.priority)
  const neighborOrder =
    parsed.data.direction === 'up'
      ? desc(ticketOptions.priority)
      : asc(ticketOptions.priority)

  const [neighbor] = await db
    .select({ id: ticketOptions.id, priority: ticketOptions.priority })
    .from(ticketOptions)
    .where(and(eq(ticketOptions.bookingUid, current.bookingUid), neighborFilter))
    .orderBy(neighborOrder)
    .limit(1)
  if (!neighbor) return

  const [topRow] = await db
    .select({ priority: ticketOptions.priority })
    .from(ticketOptions)
    .where(eq(ticketOptions.bookingUid, current.bookingUid))
    .orderBy(desc(ticketOptions.priority))
    .limit(1)
  const parkingSpot = (topRow?.priority ?? 0) + 1

  await db.transaction(async (tx) => {
    await tx
      .update(ticketOptions)
      .set({ priority: parkingSpot })
      .where(eq(ticketOptions.id, current.id))
    await tx
      .update(ticketOptions)
      .set({ priority: current.priority })
      .where(eq(ticketOptions.id, neighbor.id))
    await tx
      .update(ticketOptions)
      .set({ priority: neighbor.priority })
      .where(eq(ticketOptions.id, current.id))
  })

  await logAudit({
    type: 'option.reordered',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: current.bookingUid,
      from: current.priority,
      to: neighbor.priority,
      eventUid: current.eventUid,
    },
  })
  log.info(
    {
      optionId: current.id,
      bookingUid: current.bookingUid,
      userId: session.user.id,
      from: current.priority,
      to: neighbor.priority,
    },
    'option reordered',
  )

  revalidatePath('/')
}

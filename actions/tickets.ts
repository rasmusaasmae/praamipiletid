'use server'

import { randomUUID } from 'node:crypto'

import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listEvents, listTickets, PraamidAuthError } from '@/lib/praamid/api'
import {
  forgetCredential,
  getCredential,
  invalidateCredential,
  markVerified,
} from '@/lib/praamid/credentials'
import { cancelLogin, startLogin } from '@/lib/praamid/login'
import type { Ticket as PraamidTicket } from '@/lib/praamid/types'

const log = logger.child({ scope: 'actions/tickets' })

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthenticated')
  return session
}

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

async function fetchPraamidTickets(userId: string): Promise<PraamidTicket[]> {
  const credential = await getCredential(userId)
  if (!credential) throw new Error('No praamid.ee session captured yet')
  if (credential.expiresAt.getTime() <= Date.now()) {
    throw new Error('praamid.ee session expired')
  }
  try {
    const rawTickets = await listTickets(credential.token)
    await markVerified(userId)
    return rawTickets
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `listTickets ${err.status}`)
      throw new Error('praamid.ee session expired')
    }
    throw new Error('praamid.ee request failed')
  }
}

// Returns the user's active, future-dated tickets on praamid.ee. Returns []
// silently when praamid auth is missing/expired so the home page can render
// without surfacing a server error; the auth card prompts to reconnect.
export async function refreshTickets(): Promise<LiveTicket[]> {
  const session = await requireSession()
  let raw: PraamidTicket[]
  try {
    raw = await fetchPraamidTickets(session.user.id)
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

const subscribeTicketSchema = z.object({
  bookingUid: z.string().min(1),
  ticketCode: z.string().min(1),
})

export async function subscribeTicket(dto: z.input<typeof subscribeTicketSchema>): Promise<void> {
  const session = await requireSession()

  const parsed = subscribeTicketSchema.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')

  const fetched = await fetchPraamidTickets(session.user.id)
  const raw = fetched.find(
    (t) => t.bookingUid === parsed.data.bookingUid && t.ticketCode === parsed.data.ticketCode,
  )
  if (!raw) throw new Error('Ticket not found')

  const eventDtstart = new Date(raw.event.dtstart)
  if (Number.isNaN(eventDtstart.getTime())) {
    throw new Error('Invalid data')
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

  log.info(
    { userId: session.user.id, bookingUid: raw.bookingUid, ticketCode: raw.ticketCode },
    'ticket subscribed',
  )

  revalidatePath('/')
}

const unsubscribeTicketSchema = z.object({
  bookingUid: z.string().min(1),
})

export async function unsubscribeTicket(
  dto: z.input<typeof unsubscribeTicketSchema>,
): Promise<void> {
  const session = await requireSession()

  const parsed = unsubscribeTicketSchema.safeParse(dto)
  if (!parsed.success) throw new Error('Missing id')

  const [existing] = await db
    .select({ ticketCode: tickets.ticketCode })
    .from(tickets)
    .where(and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, parsed.data.bookingUid)))
    .limit(1)
  if (!existing) throw new Error('Ticket not found')

  await db
    .delete(tickets)
    .where(and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, parsed.data.bookingUid)))

  log.info({ userId: session.user.id, bookingUid: parsed.data.bookingUid }, 'ticket unsubscribed')

  revalidatePath('/')
}

const optionAddSchema = z.object({
  bookingUid: z.string().min(1),
  eventUid: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stopBeforeMinutes: z.coerce.number().int().min(0).optional(),
})

export async function addOption(dto: z.input<typeof optionAddSchema>): Promise<void> {
  const session = await requireSession()

  const parsed = optionAddSchema.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')

  const [ticket] = await db
    .select({
      bookingUid: tickets.bookingUid,
      direction: tickets.direction,
    })
    .from(tickets)
    .where(and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, parsed.data.bookingUid)))
    .limit(1)
  if (!ticket) throw new Error('Ticket not found')

  const events = await listEvents(ticket.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) throw new Error('Event not found')

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
  if (duplicate) throw new Error('Already an alternative for this ticket')

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

const optionUpdateSchema = z.object({
  id: z.string().min(1),
  stopBeforeMinutes: z.coerce.number().int().min(0),
})

export async function updateOption(dto: z.input<typeof optionUpdateSchema>): Promise<void> {
  const session = await requireSession()
  const parsed = optionUpdateSchema.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')

  const [owned] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      eventUid: ticketOptions.eventUid,
    })
    .from(ticketOptions)
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(ticketOptions.userId, session.user.id)))
    .limit(1)
  if (!owned) throw new Error('Alternative not found')

  await db
    .update(ticketOptions)
    .set({ stopBeforeMinutes: parsed.data.stopBeforeMinutes })
    .where(eq(ticketOptions.id, parsed.data.id))

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

export async function removeOption(dto: z.input<typeof RemoveOptionDto>): Promise<void> {
  const session = await requireSession()
  const parsed = RemoveOptionDto.safeParse(dto)
  if (!parsed.success) throw new Error('Missing id')

  const [existing] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      eventUid: ticketOptions.eventUid,
      priority: ticketOptions.priority,
    })
    .from(ticketOptions)
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(ticketOptions.userId, session.user.id)))
    .limit(1)
  if (!existing) throw new Error('Alternative not found')

  await db.delete(ticketOptions).where(eq(ticketOptions.id, parsed.data.id))

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

const optionMoveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(['up', 'down']),
})

export async function moveOption(dto: z.input<typeof optionMoveSchema>): Promise<void> {
  const session = await requireSession()
  const parsed = optionMoveSchema.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')

  const [current] = await db
    .select({
      id: ticketOptions.id,
      bookingUid: ticketOptions.bookingUid,
      priority: ticketOptions.priority,
      eventUid: ticketOptions.eventUid,
    })
    .from(ticketOptions)
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(ticketOptions.userId, session.user.id)))
    .limit(1)
  if (!current) throw new Error('Alternative not found')

  const neighborFilter =
    parsed.data.direction === 'up'
      ? lt(ticketOptions.priority, current.priority)
      : gt(ticketOptions.priority, current.priority)
  const neighborOrder =
    parsed.data.direction === 'up' ? desc(ticketOptions.priority) : asc(ticketOptions.priority)

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

// Praamid auth flow actions ------------------------------------------------

export async function forgetPraamidCredential(): Promise<void> {
  const session = await requireSession()
  try {
    await forgetCredential(session.user.id)
    revalidatePath('/')
  } catch {
    throw new Error('Invalid data')
  }
}

const StartPraamidLoginDto = z.object({
  isikukood: z.string().regex(/^\d{11}$/, 'isikukoodInvalid'),
})

export async function startPraamidLogin(dto: z.input<typeof StartPraamidLoginDto>): Promise<void> {
  const session = await requireSession()
  const parsed = StartPraamidLoginDto.safeParse(dto)
  if (!parsed.success) throw new Error('invalid_isikukood')
  await startLogin(session.user.id, parsed.data.isikukood)
}

export async function cancelPraamidLogin(): Promise<void> {
  const session = await requireSession()
  await cancelLogin(session.user.id)
}

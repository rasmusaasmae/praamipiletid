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
import { praamidee } from '@/lib/praamidee'
import { syncTicketsForUser } from '@/lib/sync-tickets'

const log = logger.child({ scope: 'actions/tickets' })

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthenticated')
  return session
}

const DEFAULT_STOP_BEFORE_MINUTES = 60

export async function refreshMyTickets(): Promise<void> {
  const session = await requireSession()
  await syncTicketsForUser(session.user.id)
  revalidatePath('/')
}

const optionAddSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
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
      id: tickets.id,
      direction: tickets.direction,
      eventUid: tickets.eventUid,
    })
    .from(tickets)
    .where(and(eq(tickets.userId, session.user.id), eq(tickets.id, parsed.data.ticketId)))
    .limit(1)
  if (!ticket) throw new Error('Ticket not found')

  if (ticket.eventUid === parsed.data.eventUid) {
    throw new Error('That alternative matches the current ticket')
  }

  const events = await praamidee.event.list(ticket.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) throw new Error('Event not found')

  const [duplicate] = await db
    .select({ id: ticketOptions.id })
    .from(ticketOptions)
    .where(
      and(eq(ticketOptions.ticketId, ticket.id), eq(ticketOptions.eventUid, parsed.data.eventUid)),
    )
    .limit(1)
  if (duplicate) throw new Error('Already an alternative for this ticket')

  const [top] = await db
    .select({ priority: ticketOptions.priority })
    .from(ticketOptions)
    .where(eq(ticketOptions.ticketId, ticket.id))
    .orderBy(desc(ticketOptions.priority))
    .limit(1)
  const nextPriority = (top?.priority ?? 0) + 1

  const stopBeforeMinutes = parsed.data.stopBeforeMinutes ?? DEFAULT_STOP_BEFORE_MINUTES

  const optionId = randomUUID()
  await db.insert(ticketOptions).values({
    id: optionId,
    ticketId: ticket.id,
    priority: nextPriority,
    eventUid: parsed.data.eventUid,
    eventDate: parsed.data.date,
    eventDtstart: new Date(event.dtstart),
    stopBeforeMinutes,
  })

  log.info(
    {
      ticketId: ticket.id,
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
      ticketId: ticketOptions.ticketId,
    })
    .from(ticketOptions)
    .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(tickets.userId, session.user.id)))
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
      ticketId: ticketOptions.ticketId,
      priority: ticketOptions.priority,
    })
    .from(ticketOptions)
    .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(tickets.userId, session.user.id)))
    .limit(1)
  if (!existing) throw new Error('Alternative not found')

  await db.delete(ticketOptions).where(eq(ticketOptions.id, parsed.data.id))

  log.info(
    {
      optionId: parsed.data.id,
      ticketId: existing.ticketId,
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
      ticketId: ticketOptions.ticketId,
      priority: ticketOptions.priority,
    })
    .from(ticketOptions)
    .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
    .where(and(eq(ticketOptions.id, parsed.data.id), eq(tickets.userId, session.user.id)))
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
    .where(and(eq(ticketOptions.ticketId, current.ticketId), neighborFilter))
    .orderBy(neighborOrder)
    .limit(1)
  if (!neighbor) return

  const [topRow] = await db
    .select({ priority: ticketOptions.priority })
    .from(ticketOptions)
    .where(eq(ticketOptions.ticketId, current.ticketId))
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
      ticketId: current.ticketId,
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
    await praamidee.user(session.user.id).auth.forget()
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
  await praamidee.user(session.user.id).auth.startLogin(parsed.data.isikukood)
}

export async function cancelPraamidLogin(): Promise<void> {
  const session = await requireSession()
  await praamidee.user(session.user.id).auth.cancelLogin()
}

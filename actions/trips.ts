'use server'

import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { tickets, tripOptions, trips } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { logAudit } from '@/lib/audit'
import {
  optionAddSchema,
  optionMoveSchema,
  optionUpdateSchema,
  tripCreateSchema,
  tripUpdateSchema,
} from '@/lib/schemas'
import { requireUser } from '@/lib/session'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'actions/trips' })

export async function createTrip(
  dto: z.input<typeof tripCreateSchema>,
): Promise<{ tripId: string }> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = tripCreateSchema.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))
  if (parsed.data.edit) throw new Error(t('editRequiresTicket'))

  const tripId = randomUUID()
  await db.insert(trips).values({
    id: tripId,
    userId: session.user.id,
    direction: parsed.data.direction,
    measurementUnit: parsed.data.measurementUnit,
    notify: parsed.data.notify ?? true,
    edit: false,
  })

  await logAudit({
    type: 'trip.created',
    actor: 'user',
    userId: session.user.id,
    tripId,
    payload: {
      direction: parsed.data.direction,
      measurementUnit: parsed.data.measurementUnit,
    },
  })
  log.info(
    { tripId, userId: session.user.id, direction: parsed.data.direction },
    'trip created',
  )

  revalidatePath('/')
  return { tripId }
}

export async function updateTrip(dto: z.input<typeof tripUpdateSchema>): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = tripUpdateSchema.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))

  const { id, ...patch } = parsed.data
  if (Object.keys(patch).length === 0) return

  if (patch.edit === true) {
    const [ownedTicket] = await db
      .select({ tripId: tickets.tripId })
      .from(tickets)
      .innerJoin(trips, eq(trips.id, tickets.tripId))
      .where(and(eq(tickets.tripId, id), eq(trips.userId, session.user.id)))
      .limit(1)
    if (!ownedTicket) throw new Error(t('editRequiresTicket'))
  }

  const res = await db
    .update(trips)
    .set(patch)
    .where(and(eq(trips.id, id), eq(trips.userId, session.user.id)))
    .returning({ id: trips.id })

  if (res.length === 0) throw new Error(t('tripNotFound'))

  await logAudit({
    type: 'trip.updated',
    actor: 'user',
    userId: session.user.id,
    tripId: id,
    payload: { changes: patch },
  })
  log.info({ tripId: id, userId: session.user.id, changes: patch }, 'trip updated')

  revalidatePath('/')
}

export async function addOption(dto: z.input<typeof optionAddSchema>): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = optionAddSchema.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))

  const [trip] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!trip) throw new Error(t('tripNotFound'))

  const events = await listEvents(trip.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) throw new Error(t('eventNotFound'))

  const [duplicate] = await db
    .select({ id: tripOptions.id })
    .from(tripOptions)
    .where(
      and(
        eq(tripOptions.tripId, trip.id),
        eq(tripOptions.eventUid, parsed.data.eventUid),
      ),
    )
    .limit(1)
  if (duplicate) throw new Error(t('optionExists'))

  const [top] = await db
    .select({ priority: tripOptions.priority })
    .from(tripOptions)
    .where(eq(tripOptions.tripId, trip.id))
    .orderBy(desc(tripOptions.priority))
    .limit(1)
  const nextPriority = (top?.priority ?? 0) + 1

  const eventStart = new Date(event.dtstart)
  const stopBeforeAt =
    parsed.data.stopBeforeAt !== undefined
      ? new Date(parsed.data.stopBeforeAt)
      : new Date(eventStart.getTime() - 60 * 60_000)
  if (stopBeforeAt.getTime() >= eventStart.getTime()) {
    throw new Error(t('invalidData'))
  }

  const optionId = randomUUID()
  await db.insert(tripOptions).values({
    id: optionId,
    tripId: trip.id,
    userId: session.user.id,
    priority: nextPriority,
    eventUid: parsed.data.eventUid,
    eventDate: parsed.data.date,
    eventDtstart: eventStart,
    stopBeforeAt,
  })

  await logAudit({
    type: 'option.added',
    actor: 'user',
    userId: session.user.id,
    tripId: trip.id,
    payload: { eventUid: parsed.data.eventUid, priority: nextPriority },
  })
  log.info(
    {
      tripId: trip.id,
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
  const t = await getTranslations('Errors')
  const parsed = optionUpdateSchema.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))

  const [owned] = await db
    .select({
      id: tripOptions.id,
      tripId: tripOptions.tripId,
      eventDtstart: tripOptions.eventDtstart,
    })
    .from(tripOptions)
    .innerJoin(trips, eq(trips.id, tripOptions.tripId))
    .where(and(eq(tripOptions.id, parsed.data.id), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!owned) throw new Error(t('tripNotFound'))

  if (parsed.data.stopBeforeAt >= owned.eventDtstart.getTime()) {
    throw new Error(t('invalidData'))
  }

  await db
    .update(tripOptions)
    .set({ stopBeforeAt: new Date(parsed.data.stopBeforeAt) })
    .where(eq(tripOptions.id, parsed.data.id))

  log.info(
    {
      optionId: parsed.data.id,
      userId: session.user.id,
      stopBeforeAt: parsed.data.stopBeforeAt,
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
  const t = await getTranslations('Errors')
  const parsed = RemoveOptionDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('missingId'))

  const [existing] = await db
    .select({
      id: tripOptions.id,
      tripId: tripOptions.tripId,
      eventUid: tripOptions.eventUid,
      priority: tripOptions.priority,
    })
    .from(tripOptions)
    .innerJoin(trips, eq(trips.id, tripOptions.tripId))
    .where(and(eq(tripOptions.id, parsed.data.id), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!existing) throw new Error(t('tripNotFound'))

  await db.delete(tripOptions).where(eq(tripOptions.id, parsed.data.id))

  await logAudit({
    type: 'option.removed',
    actor: 'user',
    userId: session.user.id,
    tripId: existing.tripId,
    payload: { eventUid: existing.eventUid, priority: existing.priority },
  })
  log.info(
    {
      optionId: parsed.data.id,
      tripId: existing.tripId,
      userId: session.user.id,
      priority: existing.priority,
    },
    'option removed',
  )

  revalidatePath('/')
}

export async function moveOption(dto: z.input<typeof optionMoveSchema>): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = optionMoveSchema.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))

  const [current] = await db
    .select({
      id: tripOptions.id,
      tripId: tripOptions.tripId,
      priority: tripOptions.priority,
      eventUid: tripOptions.eventUid,
    })
    .from(tripOptions)
    .innerJoin(trips, eq(trips.id, tripOptions.tripId))
    .where(and(eq(tripOptions.id, parsed.data.id), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!current) throw new Error(t('tripNotFound'))

  const neighborFilter =
    parsed.data.direction === 'up'
      ? lt(tripOptions.priority, current.priority)
      : gt(tripOptions.priority, current.priority)
  const neighborOrder =
    parsed.data.direction === 'up'
      ? desc(tripOptions.priority)
      : asc(tripOptions.priority)

  const [neighbor] = await db
    .select({ id: tripOptions.id, priority: tripOptions.priority })
    .from(tripOptions)
    .where(and(eq(tripOptions.tripId, current.tripId), neighborFilter))
    .orderBy(neighborOrder)
    .limit(1)
  if (!neighbor) return

  const [topRow] = await db
    .select({ priority: tripOptions.priority })
    .from(tripOptions)
    .where(eq(tripOptions.tripId, current.tripId))
    .orderBy(desc(tripOptions.priority))
    .limit(1)
  const parkingSpot = (topRow?.priority ?? 0) + 1

  await db.transaction(async (tx) => {
    await tx
      .update(tripOptions)
      .set({ priority: parkingSpot })
      .where(eq(tripOptions.id, current.id))
    await tx
      .update(tripOptions)
      .set({ priority: current.priority })
      .where(eq(tripOptions.id, neighbor.id))
    await tx
      .update(tripOptions)
      .set({ priority: neighbor.priority })
      .where(eq(tripOptions.id, current.id))
  })

  await logAudit({
    type: 'option.reordered',
    actor: 'user',
    userId: session.user.id,
    tripId: current.tripId,
    payload: { from: current.priority, to: neighbor.priority, eventUid: current.eventUid },
  })
  log.info(
    {
      optionId: current.id,
      tripId: current.tripId,
      userId: session.user.id,
      from: current.priority,
      to: neighbor.priority,
    },
    'option reordered',
  )

  revalidatePath('/')
}

const DeleteTripDto = z.object({ id: z.string().min(1) })

export async function deleteTrip(dto: z.input<typeof DeleteTripDto>): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = DeleteTripDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('missingId'))

  const [existing] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.id), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!existing) throw new Error(t('tripNotFound'))

  await db.delete(trips).where(eq(trips.id, parsed.data.id))

  await logAudit({
    type: 'trip.deleted',
    actor: 'user',
    userId: session.user.id,
    tripId: null,
    payload: { direction: existing.direction },
  })
  log.info({ tripId: parsed.data.id, userId: session.user.id }, 'trip deleted')

  revalidatePath('/')
}

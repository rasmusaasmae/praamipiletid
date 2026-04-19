'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { tripOptions, trips } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { logAudit } from '@/lib/audit'
import { requireUser } from '@/lib/session'

const directionSchema = z.enum(['VK', 'KV', 'RH', 'HR'])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createSchema = z.object({
  direction: directionSchema,
  measurementUnit: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999),
  notify: z.coerce.boolean().optional(),
  edit: z.coerce.boolean().optional(),
})

export type ActionResult = { ok: true } | { ok: false; error: string }
export type CreateTripResult =
  | { ok: true; tripId: string }
  | { ok: false; error: string }

export async function createTrip(formData: FormData): Promise<CreateTripResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = createSchema.safeParse({
    direction: formData.get('direction'),
    measurementUnit: formData.get('measurementUnit'),
    threshold: formData.get('threshold'),
    notify: formData.get('notify') ?? undefined,
    edit: formData.get('edit') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const tripId = randomUUID()
  await db.insert(trips).values({
    id: tripId,
    userId: session.user.id,
    direction: parsed.data.direction,
    measurementUnit: parsed.data.measurementUnit,
    threshold: parsed.data.threshold,
    notify: parsed.data.notify ?? true,
    edit: parsed.data.edit ?? false,
    stopBeforeMinutes: 60,
    active: true,
  })

  await logAudit({
    type: 'trip.created',
    actor: 'user',
    userId: session.user.id,
    tripId,
    payload: {
      direction: parsed.data.direction,
      measurementUnit: parsed.data.measurementUnit,
      threshold: parsed.data.threshold,
    },
  })

  revalidatePath('/')
  return { ok: true, tripId }
}

const updateSchema = z.object({
  id: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999).optional(),
  active: z.coerce.boolean().optional(),
  notify: z.coerce.boolean().optional(),
  edit: z.coerce.boolean().optional(),
})

export async function updateTrip(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    threshold: formData.get('threshold') ?? undefined,
    active: formData.get('active') ?? undefined,
    notify: formData.get('notify') ?? undefined,
    edit: formData.get('edit') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const { id, ...patch } = parsed.data
  if (Object.keys(patch).length === 0) return { ok: true }

  const res = await db
    .update(trips)
    .set(patch)
    .where(and(eq(trips.id, id), eq(trips.userId, session.user.id)))
    .returning({ id: trips.id })

  if (res.length === 0) return { ok: false, error: t('tripNotFound') }

  await logAudit({
    type: 'trip.updated',
    actor: 'user',
    userId: session.user.id,
    tripId: id,
    payload: { changes: patch },
  })

  revalidatePath('/')
  return { ok: true }
}

const addOptionSchema = z.object({
  tripId: z.string().min(1),
  eventUid: z.string().min(1),
  date: dateSchema,
})

export async function addOption(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = addOptionSchema.safeParse({
    tripId: formData.get('tripId'),
    eventUid: formData.get('eventUid'),
    date: formData.get('date'),
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const trip = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .get()
  if (!trip) return { ok: false, error: t('tripNotFound') }

  const events = await listEvents(trip.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) return { ok: false, error: t('eventNotFound') }

  const duplicate = await db
    .select({ id: tripOptions.id })
    .from(tripOptions)
    .where(
      and(
        eq(tripOptions.tripId, trip.id),
        eq(tripOptions.eventUid, parsed.data.eventUid),
      ),
    )
    .get()
  if (duplicate) return { ok: false, error: t('optionExists') }

  const top = await db
    .select({ priority: tripOptions.priority })
    .from(tripOptions)
    .where(eq(tripOptions.tripId, trip.id))
    .orderBy(desc(tripOptions.priority))
    .get()
  const nextPriority = (top?.priority ?? 0) + 1

  const optionId = randomUUID()
  await db.insert(tripOptions).values({
    id: optionId,
    tripId: trip.id,
    priority: nextPriority,
    active: true,
    eventUid: parsed.data.eventUid,
    eventDate: parsed.data.date,
    eventDtstart: new Date(event.dtstart),
  })

  await logAudit({
    type: 'option.added',
    actor: 'user',
    userId: session.user.id,
    tripId: trip.id,
    payload: { eventUid: parsed.data.eventUid, priority: nextPriority },
  })

  revalidatePath('/')
  return { ok: true }
}

export async function removeOption(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: t('missingId') }

  const existing = await db
    .select({
      id: tripOptions.id,
      tripId: tripOptions.tripId,
      eventUid: tripOptions.eventUid,
      priority: tripOptions.priority,
    })
    .from(tripOptions)
    .innerJoin(trips, eq(trips.id, tripOptions.tripId))
    .where(and(eq(tripOptions.id, id), eq(trips.userId, session.user.id)))
    .get()
  if (!existing) return { ok: false, error: t('tripNotFound') }

  await db.delete(tripOptions).where(eq(tripOptions.id, id))

  await logAudit({
    type: 'option.removed',
    actor: 'user',
    userId: session.user.id,
    tripId: existing.tripId,
    payload: { eventUid: existing.eventUid, priority: existing.priority },
  })

  revalidatePath('/')
  return { ok: true }
}

const moveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(['up', 'down']),
})

export async function moveOption(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = moveSchema.safeParse({
    id: formData.get('id'),
    direction: formData.get('direction'),
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const current = await db
    .select({
      id: tripOptions.id,
      tripId: tripOptions.tripId,
      priority: tripOptions.priority,
      eventUid: tripOptions.eventUid,
    })
    .from(tripOptions)
    .innerJoin(trips, eq(trips.id, tripOptions.tripId))
    .where(and(eq(tripOptions.id, parsed.data.id), eq(trips.userId, session.user.id)))
    .get()
  if (!current) return { ok: false, error: t('tripNotFound') }

  const neighborFilter =
    parsed.data.direction === 'up'
      ? sql`${tripOptions.priority} < ${current.priority}`
      : sql`${tripOptions.priority} > ${current.priority}`
  const aggregate =
    parsed.data.direction === 'up'
      ? sql<number>`max(${tripOptions.priority})`
      : sql<number>`min(${tripOptions.priority})`

  const neighborPriorityRow = await db
    .select({ p: aggregate })
    .from(tripOptions)
    .where(and(eq(tripOptions.tripId, current.tripId), neighborFilter))
    .get()
  const neighborPriority = neighborPriorityRow?.p ?? null
  if (neighborPriority == null) return { ok: true }

  const neighbor = await db
    .select({ id: tripOptions.id, priority: tripOptions.priority })
    .from(tripOptions)
    .where(
      and(
        eq(tripOptions.tripId, current.tripId),
        eq(tripOptions.priority, neighborPriority),
      ),
    )
    .get()
  if (!neighbor) return { ok: true }

  const topRow = await db
    .select({ p: sql<number>`max(${tripOptions.priority})` })
    .from(tripOptions)
    .where(eq(tripOptions.tripId, current.tripId))
    .get()
  const parkingSpot = (topRow?.p ?? 0) + 1

  db.transaction((tx) => {
    tx.update(tripOptions)
      .set({ priority: parkingSpot })
      .where(eq(tripOptions.id, current.id))
      .run()
    tx.update(tripOptions)
      .set({ priority: current.priority })
      .where(eq(tripOptions.id, neighbor.id))
      .run()
    tx.update(tripOptions)
      .set({ priority: neighbor.priority })
      .where(eq(tripOptions.id, current.id))
      .run()
  })

  await logAudit({
    type: 'option.reordered',
    actor: 'user',
    userId: session.user.id,
    tripId: current.tripId,
    payload: { from: current.priority, to: neighbor.priority, eventUid: current.eventUid },
  })

  revalidatePath('/')
  return { ok: true }
}

export async function deleteTrip(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: t('missingId') }

  const existing = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.userId, session.user.id)))
    .get()
  if (!existing) return { ok: false, error: t('tripNotFound') }

  await db.delete(trips).where(eq(trips.id, id))

  await logAudit({
    type: 'trip.deleted',
    actor: 'user',
    userId: session.user.id,
    tripId: null,
    payload: { direction: existing.direction },
  })

  revalidatePath('/')
  return { ok: true }
}

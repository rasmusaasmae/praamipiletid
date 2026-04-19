'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { journeyOptions, journeys } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { logAudit } from '@/lib/audit'
import { requireUser } from '@/lib/session'

const directionSchema = z.enum(['VK', 'KV', 'RH', 'HR'])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createSchema = z.object({
  direction: directionSchema,
  date: dateSchema,
  eventUid: z.string().min(1),
  measurementUnit: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999),
})

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function createJourney(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = createSchema.safeParse({
    direction: formData.get('direction'),
    date: formData.get('date'),
    eventUid: formData.get('eventUid') ?? formData.get('tripUid'),
    measurementUnit: formData.get('measurementUnit') ?? formData.get('capacityType'),
    threshold: formData.get('threshold'),
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const events = await listEvents(parsed.data.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) return { ok: false, error: t('tripNotFound') }

  const existing = await db
    .select({ id: journeys.id })
    .from(journeys)
    .innerJoin(journeyOptions, eq(journeyOptions.journeyId, journeys.id))
    .where(
      and(
        eq(journeys.userId, session.user.id),
        eq(journeys.direction, parsed.data.direction),
        eq(journeys.measurementUnit, parsed.data.measurementUnit),
        eq(journeyOptions.eventUid, parsed.data.eventUid),
        eq(journeyOptions.active, true),
      ),
    )
    .get()
  if (existing) return { ok: false, error: t('subscriptionExists') }

  const journeyId = randomUUID()
  const optionId = randomUUID()
  const eventDtstart = new Date(event.dtstart)

  db.transaction((tx) => {
    tx.insert(journeys)
      .values({
        id: journeyId,
        userId: session.user.id,
        direction: parsed.data.direction,
        measurementUnit: parsed.data.measurementUnit,
        threshold: parsed.data.threshold,
        notify: true,
        edit: false,
        stopBeforeMinutes: 60,
        active: true,
      })
      .run()
    tx.insert(journeyOptions)
      .values({
        id: optionId,
        journeyId,
        priority: 1,
        active: true,
        eventUid: parsed.data.eventUid,
        eventDate: parsed.data.date,
        eventDtstart,
      })
      .run()
  })

  await logAudit({
    type: 'journey.created',
    actor: 'user',
    userId: session.user.id,
    journeyId,
    payload: {
      direction: parsed.data.direction,
      measurementUnit: parsed.data.measurementUnit,
      threshold: parsed.data.threshold,
    },
  })
  await logAudit({
    type: 'option.added',
    actor: 'user',
    userId: session.user.id,
    journeyId,
    payload: { eventUid: parsed.data.eventUid, priority: 1 },
  })

  revalidatePath('/')
  return { ok: true }
}

const updateSchema = z.object({
  id: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999).optional(),
  active: z.coerce.boolean().optional(),
})

export async function updateJourney(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    threshold: formData.get('threshold') ?? undefined,
    active: formData.get('active') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const { id, ...patch } = parsed.data
  if (Object.keys(patch).length === 0) return { ok: true }

  const res = await db
    .update(journeys)
    .set(patch)
    .where(and(eq(journeys.id, id), eq(journeys.userId, session.user.id)))
    .returning({ id: journeys.id })

  if (res.length === 0) return { ok: false, error: t('subscriptionNotFound') }

  await logAudit({
    type: 'journey.updated',
    actor: 'user',
    userId: session.user.id,
    journeyId: id,
    payload: { changes: patch },
  })

  revalidatePath('/')
  return { ok: true }
}

const addOptionSchema = z.object({
  journeyId: z.string().min(1),
  eventUid: z.string().min(1),
  date: dateSchema,
})

export async function addOption(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')

  const parsed = addOptionSchema.safeParse({
    journeyId: formData.get('journeyId'),
    eventUid: formData.get('eventUid'),
    date: formData.get('date'),
  })
  if (!parsed.success) return { ok: false, error: t('invalidData') }

  const journey = await db
    .select({ id: journeys.id, direction: journeys.direction })
    .from(journeys)
    .where(and(eq(journeys.id, parsed.data.journeyId), eq(journeys.userId, session.user.id)))
    .get()
  if (!journey) return { ok: false, error: t('subscriptionNotFound') }

  const events = await listEvents(journey.direction, parsed.data.date)
  const event = events.find((e) => e.uid === parsed.data.eventUid)
  if (!event) return { ok: false, error: t('tripNotFound') }

  const duplicate = await db
    .select({ id: journeyOptions.id })
    .from(journeyOptions)
    .where(
      and(
        eq(journeyOptions.journeyId, journey.id),
        eq(journeyOptions.eventUid, parsed.data.eventUid),
      ),
    )
    .get()
  if (duplicate) return { ok: false, error: t('subscriptionExists') }

  const top = await db
    .select({ priority: journeyOptions.priority })
    .from(journeyOptions)
    .where(eq(journeyOptions.journeyId, journey.id))
    .orderBy(desc(journeyOptions.priority))
    .get()
  const nextPriority = (top?.priority ?? 0) + 1

  const optionId = randomUUID()
  await db.insert(journeyOptions).values({
    id: optionId,
    journeyId: journey.id,
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
    journeyId: journey.id,
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
      id: journeyOptions.id,
      journeyId: journeyOptions.journeyId,
      eventUid: journeyOptions.eventUid,
      priority: journeyOptions.priority,
    })
    .from(journeyOptions)
    .innerJoin(journeys, eq(journeys.id, journeyOptions.journeyId))
    .where(and(eq(journeyOptions.id, id), eq(journeys.userId, session.user.id)))
    .get()
  if (!existing) return { ok: false, error: t('subscriptionNotFound') }

  await db.delete(journeyOptions).where(eq(journeyOptions.id, id))

  await logAudit({
    type: 'option.removed',
    actor: 'user',
    userId: session.user.id,
    journeyId: existing.journeyId,
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
      id: journeyOptions.id,
      journeyId: journeyOptions.journeyId,
      priority: journeyOptions.priority,
      eventUid: journeyOptions.eventUid,
    })
    .from(journeyOptions)
    .innerJoin(journeys, eq(journeys.id, journeyOptions.journeyId))
    .where(and(eq(journeyOptions.id, parsed.data.id), eq(journeys.userId, session.user.id)))
    .get()
  if (!current) return { ok: false, error: t('subscriptionNotFound') }

  const neighborFilter =
    parsed.data.direction === 'up'
      ? sql`${journeyOptions.priority} < ${current.priority}`
      : sql`${journeyOptions.priority} > ${current.priority}`
  const aggregate =
    parsed.data.direction === 'up'
      ? sql<number>`max(${journeyOptions.priority})`
      : sql<number>`min(${journeyOptions.priority})`

  const neighborPriorityRow = await db
    .select({ p: aggregate })
    .from(journeyOptions)
    .where(and(eq(journeyOptions.journeyId, current.journeyId), neighborFilter))
    .get()
  const neighborPriority = neighborPriorityRow?.p ?? null
  if (neighborPriority == null) return { ok: true }

  const neighbor = await db
    .select({ id: journeyOptions.id, priority: journeyOptions.priority })
    .from(journeyOptions)
    .where(
      and(
        eq(journeyOptions.journeyId, current.journeyId),
        eq(journeyOptions.priority, neighborPriority),
      ),
    )
    .get()
  if (!neighbor) return { ok: true }

  const topRow = await db
    .select({ p: sql<number>`max(${journeyOptions.priority})` })
    .from(journeyOptions)
    .where(eq(journeyOptions.journeyId, current.journeyId))
    .get()
  const parkingSpot = (topRow?.p ?? 0) + 1

  db.transaction((tx) => {
    tx.update(journeyOptions)
      .set({ priority: parkingSpot })
      .where(eq(journeyOptions.id, current.id))
      .run()
    tx.update(journeyOptions)
      .set({ priority: current.priority })
      .where(eq(journeyOptions.id, neighbor.id))
      .run()
    tx.update(journeyOptions)
      .set({ priority: neighbor.priority })
      .where(eq(journeyOptions.id, current.id))
      .run()
  })

  await logAudit({
    type: 'option.reordered',
    actor: 'user',
    userId: session.user.id,
    journeyId: current.journeyId,
    payload: { from: current.priority, to: neighbor.priority, eventUid: current.eventUid },
  })

  revalidatePath('/')
  return { ok: true }
}

export async function deleteJourney(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: t('missingId') }

  const existing = await db
    .select({ id: journeys.id, direction: journeys.direction })
    .from(journeys)
    .where(and(eq(journeys.id, id), eq(journeys.userId, session.user.id)))
    .get()
  if (!existing) return { ok: false, error: t('subscriptionNotFound') }

  await db.delete(journeys).where(eq(journeys.id, id))

  await logAudit({
    type: 'journey.deleted',
    actor: 'user',
    userId: session.user.id,
    journeyId: null,
    payload: { direction: existing.direction },
  })

  revalidatePath('/')
  return { ok: true }
}

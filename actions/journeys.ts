'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
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

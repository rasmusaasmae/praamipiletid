'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { listTrips } from '@/lib/praamid'
import { requireUser } from '@/lib/session'

const directionSchema = z.enum(['VK', 'KV', 'RH', 'HR'])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const renotifySchema = z.enum(['once_until_depleted', 'on_change', 'every_cycle'])

const createSchema = z.object({
  direction: directionSchema,
  date: dateSchema,
  tripUid: z.string().min(1),
  capacityType: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999),
  renotifyMode: renotifySchema.default('once_until_depleted'),
})

export type CreateSubscriptionResult = { ok: true } | { ok: false; error: string }

export async function createSubscription(formData: FormData): Promise<CreateSubscriptionResult> {
  const session = await requireUser()

  const parsed = createSchema.safeParse({
    direction: formData.get('direction'),
    date: formData.get('date'),
    tripUid: formData.get('tripUid'),
    capacityType: formData.get('capacityType'),
    threshold: formData.get('threshold'),
    renotifyMode: formData.get('renotifyMode') ?? 'once_until_depleted',
  })
  if (!parsed.success) {
    return { ok: false, error: 'Vigased andmed' }
  }

  const trips = await listTrips(parsed.data.direction, parsed.data.date)
  const trip = trips.find((t) => t.uid === parsed.data.tripUid)
  if (!trip) {
    return { ok: false, error: 'Reisi ei leitud' }
  }

  try {
    await db.insert(subscriptions).values({
      id: randomUUID(),
      userId: session.user.id,
      direction: parsed.data.direction,
      date: parsed.data.date,
      tripUid: parsed.data.tripUid,
      departureAt: new Date(trip.dtstart),
      capacityType: parsed.data.capacityType,
      threshold: parsed.data.threshold,
      renotifyMode: parsed.data.renotifyMode,
      active: true,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('UNIQUE')) {
      return { ok: false, error: 'Tellimus on juba olemas' }
    }
    throw err
  }

  revalidatePath('/subscriptions')
  return { ok: true }
}

const updateSchema = z.object({
  id: z.string().min(1),
  threshold: z.coerce.number().int().min(1).max(999).optional(),
  renotifyMode: renotifySchema.optional(),
  active: z.coerce.boolean().optional(),
})

export async function updateSubscription(formData: FormData): Promise<CreateSubscriptionResult> {
  const session = await requireUser()
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    threshold: formData.get('threshold') ?? undefined,
    renotifyMode: formData.get('renotifyMode') ?? undefined,
    active: formData.get('active') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: 'Vigased andmed' }

  const { id, ...patch } = parsed.data
  if (Object.keys(patch).length === 0) return { ok: true }

  const res = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.user.id)))
    .returning({ id: subscriptions.id })

  if (res.length === 0) return { ok: false, error: 'Tellimust ei leitud' }
  revalidatePath('/subscriptions')
  return { ok: true }
}

export async function deleteSubscription(formData: FormData): Promise<CreateSubscriptionResult> {
  const session = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Puudub id' }
  await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.user.id)))
  revalidatePath('/subscriptions')
  return { ok: true }
}

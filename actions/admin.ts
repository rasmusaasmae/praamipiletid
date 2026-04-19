'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { journeys, user } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/session'
import { setSetting } from '@/lib/settings'

export type AdminActionResult = { ok: true } | { ok: false; error: string }

const intervalSchema = z.coerce.number().int().min(5_000).max(600_000)

export async function updatePollInterval(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = intervalSchema.safeParse(formData.get('pollIntervalMs'))
  if (!parsed.success) return { ok: false, error: t('pollIntervalRange') }
  await setSetting('pollIntervalMs', parsed.data)
  revalidatePath('/admin')
  return { ok: true }
}

const roleSchema = z.enum(['user', 'admin'])

export async function updateUserRole(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const id = String(formData.get('userId') ?? '')
  const parsed = roleSchema.safeParse(formData.get('role'))
  if (!id || !parsed.success) return { ok: false, error: t('invalidData') }
  await db.update(user).set({ role: parsed.data }).where(eq(user.id, id))
  revalidatePath('/admin')
  return { ok: true }
}

export async function deleteAnyJourney(formData: FormData): Promise<AdminActionResult> {
  const session = await requireAdmin()
  const t = await getTranslations('Errors')
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: t('missingId') }
  const target = await db
    .select({ direction: journeys.direction, userId: journeys.userId })
    .from(journeys)
    .where(eq(journeys.id, id))
    .get()
  if (!target) return { ok: false, error: t('journeyNotFound') }
  await db.delete(journeys).where(eq(journeys.id, id))
  await logAudit({
    type: 'journey.deleted',
    actor: 'user',
    userId: session.user.id,
    journeyId: null,
    payload: { direction: target.direction },
  })
  revalidatePath('/admin')
  return { ok: true }
}

'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { trips, user } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { pollIntervalSchema, userRoleSchema } from '@/lib/schemas'
import { requireAdmin } from '@/lib/session'
import { setSetting } from '@/lib/settings'

export type AdminActionResult = { ok: true } | { ok: false; error: string }

export async function updatePollInterval(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = pollIntervalSchema.safeParse(formData.get('pollIntervalMs'))
  if (!parsed.success) return { ok: false, error: t('pollIntervalRange') }
  await setSetting('pollIntervalMs', parsed.data)
  revalidatePath('/admin')
  return { ok: true }
}

export async function setEditGloballyEnabled(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const raw = String(formData.get('enabled') ?? '')
  if (raw !== '0' && raw !== '1') return { ok: false, error: t('invalidData') }
  await setSetting('editGloballyEnabled', raw === '1' ? 1 : 0)
  revalidatePath('/admin')
  return { ok: true }
}

export async function updateUserRole(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const id = String(formData.get('userId') ?? '')
  const parsed = userRoleSchema.safeParse(formData.get('role'))
  if (!id || !parsed.success) return { ok: false, error: t('invalidData') }
  await db.update(user).set({ role: parsed.data }).where(eq(user.id, id))
  revalidatePath('/admin')
  return { ok: true }
}

export async function deleteAnyTrip(formData: FormData): Promise<AdminActionResult> {
  const session = await requireAdmin()
  const t = await getTranslations('Errors')
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: t('missingId') }
  const [target] = await db
    .select({ direction: trips.direction, userId: trips.userId })
    .from(trips)
    .where(eq(trips.id, id))
    .limit(1)
  if (!target) return { ok: false, error: t('tripNotFound') }
  await db.delete(trips).where(eq(trips.id, id))
  await logAudit({
    type: 'trip.deleted',
    actor: 'user',
    userId: session.user.id,
    tripId: null,
    payload: { direction: target.direction },
  })
  revalidatePath('/admin')
  return { ok: true }
}

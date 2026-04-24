'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { trips, user } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { pollIntervalNumberSchema, userRoleSchema } from '@/lib/schemas'
import { requireAdmin } from '@/lib/session'
import { setSetting } from '@/lib/settings'

const UpdatePollIntervalDto = z.object({ pollIntervalMs: pollIntervalNumberSchema })

export async function updatePollInterval(
  dto: z.input<typeof UpdatePollIntervalDto>,
): Promise<void> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = UpdatePollIntervalDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('pollIntervalRange'))
  await setSetting('pollIntervalMs', parsed.data.pollIntervalMs)
  revalidatePath('/admin')
}

const SetEditGloballyEnabledDto = z.object({ enabled: z.boolean() })

export async function setEditGloballyEnabled(
  dto: z.input<typeof SetEditGloballyEnabledDto>,
): Promise<void> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = SetEditGloballyEnabledDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))
  await setSetting('editGloballyEnabled', parsed.data.enabled ? 1 : 0)
  revalidatePath('/admin')
}

const UpdateUserRoleDto = z.object({
  userId: z.string().min(1),
  role: userRoleSchema,
})

export async function updateUserRole(
  dto: z.input<typeof UpdateUserRoleDto>,
): Promise<void> {
  await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = UpdateUserRoleDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('invalidData'))
  await db
    .update(user)
    .set({ role: parsed.data.role })
    .where(eq(user.id, parsed.data.userId))
  revalidatePath('/admin')
}

const DeleteAnyTripDto = z.object({ id: z.string().min(1) })

export async function deleteAnyTrip(
  dto: z.input<typeof DeleteAnyTripDto>,
): Promise<void> {
  const session = await requireAdmin()
  const t = await getTranslations('Errors')
  const parsed = DeleteAnyTripDto.safeParse(dto)
  if (!parsed.success) throw new Error(t('missingId'))
  const [target] = await db
    .select({ direction: trips.direction, userId: trips.userId })
    .from(trips)
    .where(eq(trips.id, parsed.data.id))
    .limit(1)
  if (!target) throw new Error(t('tripNotFound'))
  await db.delete(trips).where(eq(trips.id, parsed.data.id))
  await logAudit({
    type: 'trip.deleted',
    actor: 'user',
    userId: session.user.id,
    tripId: null,
    payload: { direction: target.direction },
  })
  revalidatePath('/admin')
}

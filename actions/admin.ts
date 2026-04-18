'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { subscriptions, user } from '@/db/schema'
import { requireAdmin } from '@/lib/session'
import { setSetting } from '@/lib/settings'

export type AdminActionResult = { ok: true } | { ok: false; error: string }

const intervalSchema = z.coerce.number().int().min(5_000).max(600_000)

export async function updatePollInterval(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const parsed = intervalSchema.safeParse(formData.get('pollIntervalMs'))
  if (!parsed.success) return { ok: false, error: 'Väärtus peab olema 5000..600000 ms' }
  await setSetting('pollIntervalMs', parsed.data)
  revalidatePath('/admin')
  return { ok: true }
}

const roleSchema = z.enum(['user', 'admin'])

export async function updateUserRole(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const id = String(formData.get('userId') ?? '')
  const parsed = roleSchema.safeParse(formData.get('role'))
  if (!id || !parsed.success) return { ok: false, error: 'Vigased andmed' }
  await db.update(user).set({ role: parsed.data }).where(eq(user.id, id))
  revalidatePath('/admin')
  return { ok: true }
}

export async function deleteAnySubscription(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Puudub id' }
  await db.delete(subscriptions).where(eq(subscriptions.id, id))
  revalidatePath('/admin')
  return { ok: true }
}

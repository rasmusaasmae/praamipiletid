'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { user } from '@/db/schema'
import { requireUser } from '@/lib/session'

const topicSchema = z
  .string()
  .min(4, 'Vähemalt 4 tähemärki')
  .max(64, 'Kuni 64 tähemärki')
  .regex(/^[A-Za-z0-9_-]+$/, 'Ainult tähed, numbrid, _ ja -')

export type UpdateTopicResult = { ok: true } | { ok: false; error: string }

export async function updateNtfyTopic(formData: FormData): Promise<UpdateTopicResult> {
  const session = await requireUser()
  const parsed = topicSchema.safeParse(formData.get('ntfyTopic'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Vigane teema' }
  }
  try {
    await db.update(user).set({ ntfyTopic: parsed.data }).where(eq(user.id, session.user.id))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('UNIQUE')) {
      return { ok: false, error: 'See teema on juba kasutusel' }
    }
    throw err
  }
  revalidatePath('/settings')
  return { ok: true }
}

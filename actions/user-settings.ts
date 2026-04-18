'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { user } from '@/db/schema'
import { requireUser } from '@/lib/session'

export type UpdateTopicResult = { ok: true } | { ok: false; error: string }

export async function updateNtfyTopic(formData: FormData): Promise<UpdateTopicResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const topicSchema = z
    .string()
    .min(4, t('topicMin'))
    .max(64, t('topicMax'))
    .regex(/^[A-Za-z0-9_-]+$/, t('topicPattern'))
  const parsed = topicSchema.safeParse(formData.get('ntfyTopic'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('topicInvalid') }
  }
  try {
    await db.update(user).set({ ntfyTopic: parsed.data }).where(eq(user.id, session.user.id))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('UNIQUE')) {
      return { ok: false, error: t('topicInUse') }
    }
    throw err
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}

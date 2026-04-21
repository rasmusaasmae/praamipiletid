'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { user } from '@/db/schema'
import { ntfyTopicSchema } from '@/lib/schemas'
import { requireUser } from '@/lib/session'

export type UpdateTopicResult = { ok: true } | { ok: false; error: string }

export async function updateNtfyTopic(formData: FormData): Promise<UpdateTopicResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = ntfyTopicSchema.safeParse(formData.get('ntfyTopic'))
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message
    const errorKeys = ['topicMin', 'topicMax', 'topicPattern'] as const
    type ErrorKey = (typeof errorKeys)[number]
    const isErrorKey = (v: string | undefined): v is ErrorKey =>
      v !== undefined && (errorKeys as readonly string[]).includes(v)
    return { ok: false, error: isErrorKey(key) ? t(key) : t('topicInvalid') }
  }
  try {
    await db.update(user).set({ ntfyTopic: parsed.data }).where(eq(user.id, session.user.id))
  } catch (err: unknown) {
    // 23505 = unique_violation. The UPDATE only touches ntfy_topic, so the
    // only unique constraint it can collide with is user_ntfy_topic_unique.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { ok: false, error: t('topicInUse') }
    }
    throw err
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}

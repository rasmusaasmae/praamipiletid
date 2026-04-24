'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { ntfyTopicSchema } from '@/lib/schemas'
import { requireUser } from '@/lib/session'

const UpdateNtfyTopicDto = z.object({ ntfyTopic: ntfyTopicSchema })

export async function updateNtfyTopic(
  dto: z.input<typeof UpdateNtfyTopicDto>,
): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  const parsed = UpdateNtfyTopicDto.safeParse(dto)
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message
    const errorKeys = ['topicMin', 'topicMax', 'topicPattern'] as const
    type ErrorKey = (typeof errorKeys)[number]
    const isErrorKey = (v: string | undefined): v is ErrorKey =>
      v !== undefined && (errorKeys as readonly string[]).includes(v)
    throw new Error(isErrorKey(key) ? t(key) : t('topicInvalid'))
  }
  try {
    await db
      .update(userSettings)
      .set({ ntfyTopic: parsed.data.ntfyTopic })
      .where(eq(userSettings.userId, session.user.id))
  } catch (err: unknown) {
    // 23505 = unique_violation. The UPDATE only touches ntfy_topic, so the
    // only unique constraint it can collide with is the ntfy_topic unique
    // index on user_settings.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new Error(t('topicInUse'))
    }
    throw err
  }
  revalidatePath('/')
  revalidatePath('/settings')
}

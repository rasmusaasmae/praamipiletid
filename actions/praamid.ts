'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { forgetCredential } from '@/lib/praamid-credentials'
import { cancelLogin, startLogin } from '@/lib/praamid-login'
import { isikukoodSchema } from '@/lib/schemas'

export async function forgetPraamidCredential(): Promise<void> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  try {
    await forgetCredential(session.user.id)
    revalidatePath('/settings')
  } catch {
    throw new Error(t('invalidData'))
  }
}

const StartPraamidLoginDto = z.object({ isikukood: isikukoodSchema })

export async function startPraamidLogin(
  dto: z.input<typeof StartPraamidLoginDto>,
): Promise<void> {
  const session = await requireUser()
  const parsed = StartPraamidLoginDto.safeParse(dto)
  if (!parsed.success) throw new Error('invalid_isikukood')
  await startLogin(session.user.id, parsed.data.isikukood)
}

export async function cancelPraamidLogin(): Promise<void> {
  const session = await requireUser()
  await cancelLogin(session.user.id)
}

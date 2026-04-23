'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/session'
import { forgetCredential } from '@/lib/praamid-credentials'
import { cancelLogin, startLogin } from '@/lib/praamid-login'
import { isikukoodSchema } from '@/lib/schemas'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function forgetPraamidCredential(): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  try {
    await forgetCredential(session.user.id)
    revalidatePath('/settings')
    return { ok: true }
  } catch {
    return { ok: false, error: t('invalidData') }
  }
}

export async function startPraamidLogin(isikukood: string): Promise<ActionResult> {
  const session = await requireUser()
  const parsed = isikukoodSchema.safeParse(isikukood)
  if (!parsed.success) return { ok: false, error: 'invalid_isikukood' }
  try {
    await startLogin(session.user.id, parsed.data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'start_failed' }
  }
}

export async function cancelPraamidLogin(): Promise<ActionResult> {
  const session = await requireUser()
  await cancelLogin(session.user.id)
  return { ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/session'
import { forgetCredential } from '@/lib/praamid-credentials'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function forgetPraamidCredential(): Promise<ActionResult> {
  const session = await requireUser()
  const t = await getTranslations('Errors')
  try {
    await forgetCredential(session.user.id)
    revalidatePath('/settings/praamid')
    return { ok: true }
  } catch {
    return { ok: false, error: t('invalidData') }
  }
}

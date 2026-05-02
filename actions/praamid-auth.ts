'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireSession } from '@/lib/auth'
import { praamidee } from '@/lib/praamidee'

export async function forgetPraamidCredential(): Promise<void> {
  const session = await requireSession()
  try {
    await praamidee.user(session.user.id).auth.forget()
    revalidatePath('/')
  } catch {
    throw new Error('Invalid data')
  }
}

const StartPraamidLoginDto = z.object({
  isikukood: z.string().regex(/^\d{11}$/, 'isikukoodInvalid'),
})

export async function startPraamidLogin(dto: z.input<typeof StartPraamidLoginDto>): Promise<void> {
  const session = await requireSession()
  const parsed = StartPraamidLoginDto.safeParse(dto)
  if (!parsed.success) throw new Error('invalid_isikukood')
  await praamidee.user(session.user.id).auth.startLogin(parsed.data.isikukood)
}

export async function cancelPraamidLogin(): Promise<void> {
  const session = await requireSession()
  await praamidee.user(session.user.id).auth.cancelLogin()
}

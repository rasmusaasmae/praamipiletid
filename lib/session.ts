import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { redirect } from '@/i18n/navigation'

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function requireUser() {
  const session = await getSession()
  if (!session) {
    const locale = await getLocale()
    throw redirect({ href: '/sign-in', locale })
  }
  return session
}

export async function requireAdmin() {
  const session = await requireUser()
  if (session.user.role !== 'admin') {
    const locale = await getLocale()
    throw redirect({ href: '/', locale })
  }
  return session
}

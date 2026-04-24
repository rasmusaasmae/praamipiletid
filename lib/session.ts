import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function requireUser() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return session
}

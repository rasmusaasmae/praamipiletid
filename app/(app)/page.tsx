import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Home } from '@/components/home'
import { auth } from '@/lib/auth'
import { maybeSyncTickets } from '@/lib/auto-swap'
import { getQueryClient } from '@/lib/get-query-client'
import { praamidee } from '@/lib/praamidee'
import { getMyPraamidAuthState, getTicketsWithOptions } from '@/lib/queries'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')
  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const info = configured ? await praamidee.user(session.user.id).auth.get() : null

  if (configured) {
    await maybeSyncTickets(session.user.id, { maxAgeMs: 60_000 })
  }

  const queryClient = getQueryClient()
  void queryClient.prefetchQuery({
    queryKey: ['tickets'],
    queryFn: () => getTicketsWithOptions(),
  })
  if (configured) {
    void queryClient.prefetchQuery({
      queryKey: ['praamidAuthState'],
      queryFn: () => getMyPraamidAuthState(),
    })
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Home
        configured={configured}
        credentialMeta={
          info && info.capturedAt && info.expiresAt
            ? {
                capturedAt: info.capturedAt,
                expiresAt: info.expiresAt,
                lastVerifiedAt: info.lastVerifiedAt,
                lastError: info.lastError,
              }
            : null
        }
      />
    </HydrationBoundary>
  )
}

import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { headers } from 'next/headers'

import { refreshTickets } from '@/actions/tickets'
import { Home } from '@/components/home'
import { auth } from '@/lib/auth'
import { getQueryClient } from '@/lib/get-query-client'
import { getCredentialStatus } from '@/lib/praamid/credentials'
import { getMyPraamidAuthState, getTicketsWithOptions } from '@/lib/queries'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const status = configured ? await getCredentialStatus(session.user.id) : null

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
    void queryClient.prefetchQuery({
      queryKey: ['praamidTickets'],
      queryFn: () => refreshTickets(),
    })
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Home
        configured={configured}
        credentialMeta={
          status
            ? {
                capturedAt: status.capturedAt,
                expiresAt: status.expiresAt,
                lastVerifiedAt: status.lastVerifiedAt,
                lastError: status.lastError,
              }
            : null
        }
      />
    </HydrationBoundary>
  )
}

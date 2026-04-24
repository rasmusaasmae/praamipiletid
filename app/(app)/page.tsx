import { headers } from 'next/headers'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { Home } from '@/components/home'
import { getQueryClient } from '@/lib/get-query-client'
import { praamidAuthStateQueryOptions, ticketsQueryOptions } from '@/lib/queries'
import { refreshTickets } from '@/actions/tickets'
import { auth } from '@/lib/auth'
import { getCredentialStatus } from '@/lib/praamid/credentials'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const status = configured ? await getCredentialStatus(session.user.id) : null

  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(ticketsQueryOptions)
  if (configured) {
    void queryClient.prefetchQuery(praamidAuthStateQueryOptions)
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

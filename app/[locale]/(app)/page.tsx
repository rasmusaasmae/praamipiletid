import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { Home } from '@/components/home'
import { getQueryClient } from '@/lib/get-query-client'
import { ticketsQueryOptions } from '@/lib/query-options'
import { refreshTickets } from '@/actions/tickets'

export default async function HomePage() {
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(ticketsQueryOptions)
  void queryClient.prefetchQuery({
    queryKey: ['praamidTickets'],
    queryFn: () => refreshTickets(),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Home />
    </HydrationBoundary>
  )
}

import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { Home } from '@/components/home'
import { getQueryClient } from '@/lib/get-query-client'
import { tripsQueryOptions } from '@/lib/query-options'

export default async function HomePage() {
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(tripsQueryOptions)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Home />
    </HydrationBoundary>
  )
}

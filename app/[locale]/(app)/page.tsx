import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { Home } from '@/components/home'
import { getQueryClient } from '@/lib/get-query-client'
import { tripsQueryOptions } from '@/lib/query-options'
import { getAllSettings } from '@/lib/settings'

export default async function HomePage() {
  const { pollIntervalMs } = await getAllSettings()
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(tripsQueryOptions)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Home pollIntervalMs={pollIntervalMs} />
    </HydrationBoundary>
  )
}

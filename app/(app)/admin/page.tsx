import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { Admin } from '@/components/admin/admin'
import { requireAdmin } from '@/lib/session'
import { getQueryClient } from '@/lib/get-query-client'
import { adminDashboardQueryOptions } from '@/lib/query-options'

export default async function AdminPage() {
  // Guard the page before streaming — the queryFn re-checks too, but an
  // explicit await here redirects non-admins before the shell ever renders.
  await requireAdmin()
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(adminDashboardQueryOptions)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Admin />
    </HydrationBoundary>
  )
}

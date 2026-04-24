'use client'

import { Button } from '@/components/ui/button'
import { setEditGloballyEnabled } from '@/actions/admin'
import { useOptimisticMutation } from '@/lib/mutations'
import { adminDashboardQueryOptions, type AdminDashboardData } from '@/lib/query-options'

export function EditEnabledForm({ enabled }: { enabled: boolean }) {
  const toggleMutation = useOptimisticMutation<boolean, AdminDashboardData>({
    queryKey: adminDashboardQueryOptions.queryKey,
    mutationFn: (next) => setEditGloballyEnabled({ enabled: next }),
    optimisticUpdate: (old, next) => ({ ...old, editGloballyEnabled: next }),
    successMessage: 'Saved',
  })

  return (
    <Button
      type="button"
      variant={enabled ? 'destructive' : 'default'}
      disabled={toggleMutation.isPending}
      onClick={() => toggleMutation.mutate(!enabled)}
    >
      {toggleMutation.isPending
        ? 'Saving…'
        : enabled
          ? 'Disable globally'
          : 'Enable globally'}
    </Button>
  )
}

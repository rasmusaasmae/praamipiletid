'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setEditGloballyEnabled } from '@/actions/admin'
import { useOptimisticMutation } from '@/lib/mutations'
import { adminDashboardQueryOptions, type AdminDashboardData } from '@/lib/query-options'

export function EditEnabledForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations('Admin')

  const toggleMutation = useOptimisticMutation<boolean, AdminDashboardData>({
    queryKey: adminDashboardQueryOptions.queryKey,
    action: (next) => {
      const form = new FormData()
      form.set('enabled', next ? '1' : '0')
      return setEditGloballyEnabled(form)
    },
    optimisticUpdate: (old, next) => ({ ...old, editGloballyEnabled: next }),
    successMessage: t('saved'),
  })

  return (
    <Button
      type="button"
      variant={enabled ? 'destructive' : 'default'}
      disabled={toggleMutation.isPending}
      onClick={() => toggleMutation.mutate(!enabled)}
    >
      {toggleMutation.isPending ? t('saving') : enabled ? t('editDisable') : t('editEnable')}
    </Button>
  )
}

'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setEditGloballyEnabled } from '@/actions/admin'

export function EditEnabledForm({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Admin')

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const res = await setEditGloballyEnabled(formData)
          if (res.ok) toast.success(t('saved'))
          else toast.error(res.error)
        })
      }
    >
      <input type="hidden" name="enabled" value={enabled ? '0' : '1'} />
      <Button type="submit" variant={enabled ? 'destructive' : 'default'} disabled={isPending}>
        {isPending ? t('saving') : enabled ? t('editDisable') : t('editEnable')}
      </Button>
    </form>
  )
}

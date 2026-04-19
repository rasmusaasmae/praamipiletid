'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { forgetPraamidCredential } from '@/actions/praamid'

export function ForgetPraamidButton() {
  const t = useTranslations('Praamid')
  const [isForgetting, startForget] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isForgetting}
      aria-label={t('forget')}
      title={t('forget')}
      onClick={() =>
        startForget(async () => {
          if (!confirm(t('forgetConfirm'))) return
          const res = await forgetPraamidCredential()
          if (res.ok) toast.success(t('forgotten'))
          else toast.error(res.error)
        })
      }
    >
      <Trash2 className="size-4" />
    </Button>
  )
}

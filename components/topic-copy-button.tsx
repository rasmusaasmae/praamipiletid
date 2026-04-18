'use client'

import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TopicCopyButton({ value }: { value: string }) {
  const t = useTranslations('Settings')
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        toast.success(t('copied'))
      }}
      aria-label={t('copy')}
    >
      <Copy className="size-4" />
    </Button>
  )
}

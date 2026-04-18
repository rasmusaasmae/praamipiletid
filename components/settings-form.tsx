'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateNtfyTopic } from '@/actions/user-settings'

export function SettingsForm({ currentTopic, ntfyBase }: { currentTopic: string; ntfyBase: string }) {
  const [topic, setTopic] = useState(currentTopic)
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Settings')

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          const res = await updateNtfyTopic(formData)
          if (res.ok) toast.success(t('saved'))
          else toast.error(res.error)
        })
      }
    >
      <div>
        <Label htmlFor="ntfyTopic" className="mb-1 block">
          {t('topicLabel')}
        </Label>
        <div className="flex gap-2">
          <Input
            id="ntfyTopic"
            name="ntfyTopic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            pattern="^[A-Za-z0-9_-]+$"
            minLength={4}
            maxLength={64}
            required
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!topic}
            onClick={async () => {
              await navigator.clipboard.writeText(topic)
              toast.success(t('copied'))
            }}
            aria-label={t('copy')}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('urlPreview', { base: ntfyBase, topic: topic || t('topicPlaceholder') })}
        </p>
      </div>
      <Button type="submit" disabled={isPending || topic === currentTopic} className="self-start">
        {isPending ? t('saving') : t('save')}
      </Button>
    </form>
  )
}

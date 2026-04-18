'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePollInterval } from '@/actions/admin'

export function PollIntervalForm({ current }: { current: number }) {
  const [value, setValue] = useState(String(current))
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Admin')

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      action={(formData) =>
        startTransition(async () => {
          const res = await updatePollInterval(formData)
          if (res.ok) toast.success(t('saved'))
          else toast.error(res.error)
        })
      }
    >
      <div className="flex-1">
        <Label htmlFor="pollIntervalMs" className="mb-1 block">
          {t('pollLabel')}
        </Label>
        <Input
          id="pollIntervalMs"
          name="pollIntervalMs"
          type="number"
          min={5_000}
          max={600_000}
          step={1_000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending || value === String(current)}>
        {isPending ? t('saving') : t('save')}
      </Button>
    </form>
  )
}

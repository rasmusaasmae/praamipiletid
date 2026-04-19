'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { createTrip } from '@/actions/trips'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Option = { code: string; label: string }

type Props = {
  directions: Option[]
  units: Option[]
}

export function NewTripForm({ directions, units }: Props) {
  const router = useRouter()
  const t = useTranslations('NewTrip')
  const [isPending, startTransition] = useTransition()

  const [direction, setDirection] = useState(directions[0]?.code ?? 'HR')
  const [unit, setUnit] = useState(units[0]?.code ?? 'sv')
  const [notify, setNotify] = useState(true)
  const [edit, setEdit] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const form = new FormData()
    form.set('direction', direction)
    form.set('measurementUnit', unit)
    if (notify) form.set('notify', 'true')
    if (edit) form.set('edit', 'true')

    startTransition(async () => {
      const res = await createTrip(form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(t('created'))
      router.push(`/trips/${res.tripId}/options`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="direction">{t('direction')}</Label>
        <Select value={direction} onValueChange={(v) => v && setDirection(v)}>
          <SelectTrigger id="direction" className="w-full">
            <SelectValue>
              {(v: string) => directions.find((d) => d.code === v)?.label ?? v}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {directions.map((d) => (
              <SelectItem key={d.code} value={d.code}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="unit">{t('measurementUnit')}</Label>
        <Select value={unit} onValueChange={(v) => v && setUnit(v)}>
          <SelectTrigger id="unit" className="w-full">
            <SelectValue>
              {(v: string) => units.find((u) => u.code === v)?.label ?? v}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{t('notifyLabel')}</span>
            <span className="text-xs text-muted-foreground">{t('notifyHelp')}</span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={edit}
            onChange={(e) => setEdit(e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{t('editLabel')}</span>
            <span className="text-xs text-muted-foreground">{t('editHelp')}</span>
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push('/')}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('creating') : t('submit')}
        </Button>
      </div>
    </form>
  )
}

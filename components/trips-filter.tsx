'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRouter } from '@/i18n/navigation'

type Props = {
  directions: ReadonlyArray<{ code: string; label: string }>
  currentDirection: string
  currentDate: string
  tripId: string
  directionLocked?: boolean
}

export function TripsFilter({
  directions,
  currentDirection,
  currentDate,
  tripId,
  directionLocked,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('TripsFilter')

  const push = (_direction: string, date: string) => {
    const qs = new URLSearchParams({ date })
    startTransition(() => router.push(`/trips/${tripId}/options?${qs.toString()}`))
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
      <div>
        <Label htmlFor="direction" className="mb-1 block">
          {t('direction')}
        </Label>
        <Select
          value={currentDirection}
          onValueChange={(v) => v && push(v, currentDate)}
          disabled={isPending || directionLocked}
        >
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
      <div>
        <Label htmlFor="date" className="mb-1 block">
          {t('date')}
        </Label>
        <Input
          id="date"
          type="date"
          defaultValue={currentDate}
          disabled={isPending}
          onChange={(e) => {
            if (e.target.value) push(currentDirection, e.target.value)
          }}
        />
      </div>
    </div>
  )
}

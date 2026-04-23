'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { addOption } from '@/actions/trips'
import { SHIP_NAMES, type PraamidEvent } from '@/lib/praamid'
import { tripsQueryOptions } from '@/lib/query-options'

const CAPACITY_ORDER = ['sv', 'bv', 'pcs', 'mc', 'bc'] as const

type Props = {
  event: PraamidEvent
  tripId: string
  date: string
  measurementUnit: string
  alreadyAdded: boolean
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export function EventCard({ event, tripId, date, measurementUnit, alreadyAdded }: Props) {
  const t = useTranslations('EventCard')
  const tCap = useTranslations('Capacity')
  const queryClient = useQueryClient()

  const highlighted = measurementUnit

  const addMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('tripId', tripId)
      form.set('eventUid', event.uid)
      form.set('date', date)
      const res = await addOption(form)
      if (!res.ok) throw new Error(res.error)
    },
    onSuccess: () => {
      toast.success(t('optionAdded'))
      queryClient.invalidateQueries({ queryKey: tripsQueryOptions.queryKey })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{formatTime(event.dtstart)}</span>
            <span className="text-sm text-muted-foreground">→ {formatTime(event.dtend)}</span>
            <Badge variant="outline">{SHIP_NAMES[event.ship.code] ?? event.ship.code}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {CAPACITY_ORDER.map((code) => {
              const v = event.capacities[code]
              if (v == null) return null
              const isWatched = code === highlighted
              return (
                <span
                  key={code}
                  className={
                    isWatched
                      ? 'rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary'
                      : 'rounded-md bg-secondary px-2 py-0.5'
                  }
                >
                  {tCap(code)}: <span className="font-medium text-foreground">{v}</span>
                </span>
              )
            })}
          </div>
        </div>
        <Button
          disabled={addMutation.isPending || alreadyAdded}
          onClick={() => addMutation.mutate()}
        >
          {alreadyAdded
            ? t('alreadyAdded')
            : addMutation.isPending
              ? t('saving')
              : t('addOption')}
        </Button>
      </CardContent>
    </Card>
  )
}

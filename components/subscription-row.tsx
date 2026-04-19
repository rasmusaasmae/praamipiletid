'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableCell, TableRow } from '@/components/ui/table'
import { deleteJourney, updateJourney } from '@/actions/journeys'

export type JourneyListItem = {
  id: string
  direction: string
  measurementUnit: string
  threshold: number
  active: boolean
  eventUid: string
  eventDate: string
  eventDtstart: Date
  lastCapacity: number | null
}

export function SubscriptionRow({ row }: { row: JourneyListItem }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Subscriptions')
  const tCap = useTranslations('Capacity')
  const tDir = useTranslations('Directions')
  const locale = useLocale()

  const formatTime = (d: Date) => {
    const tag = locale === 'et' ? 'et-EE' : 'en-GB'
    return d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })
  }

  const submitUpdate = (field: 'threshold' | 'active', value: string) => {
    const form = new FormData()
    form.set('id', row.id)
    form.set(field, value)
    startTransition(async () => {
      const res = await updateJourney(form)
      if (res.ok) toast.success(t('saved'))
      else toast.error(res.error)
    })
  }

  const submitDelete = () => {
    const form = new FormData()
    form.set('id', row.id)
    startTransition(async () => {
      const res = await deleteJourney(form)
      if (res.ok) toast.success(t('deleted'))
      else toast.error(res.error)
    })
  }

  const past = row.eventDtstart.getTime() < Date.now()

  return (
    <TableRow>
      <TableCell>
        <div className="text-base font-semibold">{tDir(row.direction as 'VK')}</div>
        <div className="text-lg tabular-nums text-muted-foreground">
          {formatTime(row.eventDtstart)}
        </div>
      </TableCell>
      <TableCell>{tCap(row.measurementUnit as 'sv')}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          defaultValue={row.threshold}
          className="w-20"
          disabled={isPending || past}
          onBlur={(e) => {
            if (Number(e.target.value) !== row.threshold) {
              submitUpdate('threshold', e.target.value)
            }
          }}
        />
      </TableCell>
      <TableCell>
        {past ? (
          <Badge variant="secondary">{t('statusPast')}</Badge>
        ) : row.active ? (
          <Badge>{t('statusActive')}</Badge>
        ) : (
          <Badge variant="outline">{t('statusPaused')}</Badge>
        )}
      </TableCell>
      <TableCell className="space-x-1 text-right">
        {!past ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => submitUpdate('active', row.active ? '' : 'true')}
          >
            {row.active ? t('pause') : t('activate')}
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" disabled={isPending} onClick={submitDelete}>
          {t('delete')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

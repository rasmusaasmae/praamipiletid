'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { TicketSlot } from '@/components/ticket-slot'
import {
  deleteTrip,
  moveOption,
  removeOption,
  updateTrip,
} from '@/actions/trips'
import type { Ticket } from '@/db/schema'

export type TripCardData = {
  trip: {
    id: string
    direction: string
    measurementUnit: string
    threshold: number
    active: boolean
    notify: boolean
    edit: boolean
  }
  options: Array<{
    id: string
    tripId: string
    priority: number
    active: boolean
    eventUid: string
    eventDate: string
    eventDtstart: Date
    lastCapacity: number | null
    lastCapacityState: string | null
  }>
  ticket: Ticket | null
}

export function TripCard({ data }: { data: TripCardData }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Trips')
  const tOpt = useTranslations('Options')
  const tCap = useTranslations('Capacity')
  const tDir = useTranslations('Directions')
  const locale = useLocale()

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatDate = (d: Date) =>
    d.toLocaleDateString(dateTag, { weekday: 'short', day: 'numeric', month: 'short' })
  const formatTime = (d: Date) =>
    d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })

  const allPast =
    data.options.length > 0 && data.options.every((o) => o.eventDtstart.getTime() < Date.now())

  const submit = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) toast.success(okMsg)
      else toast.error(res.error)
    })

  const toggleActive = () => {
    const form = new FormData()
    form.set('id', data.trip.id)
    form.set('active', data.trip.active ? '' : 'true')
    submit(() => updateTrip(form), t('saved'))
  }

  const toggleFlag = (flag: 'notify' | 'edit', next: boolean) => {
    const form = new FormData()
    form.set('id', data.trip.id)
    form.set(flag, next ? 'true' : '')
    submit(() => updateTrip(form), t('saved'))
  }

  const onDeleteTrip = () => {
    const form = new FormData()
    form.set('id', data.trip.id)
    submit(() => deleteTrip(form), t('deleted'))
  }

  const onRemoveOption = (id: string) => {
    const form = new FormData()
    form.set('id', id)
    submit(() => removeOption(form), tOpt('removed'))
  }

  const onMoveOption = (id: string, direction: 'up' | 'down') => {
    const form = new FormData()
    form.set('id', id)
    form.set('direction', direction)
    submit(() => moveOption(form), tOpt('moved'))
  }

  const sorted = [...data.options].sort((a, b) => a.priority - b.priority)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{tDir(data.trip.direction as 'VK')}</span>
            <Badge variant="outline">{tCap(data.trip.measurementUnit as 'sv')}</Badge>
            <Badge variant="secondary">
              {t('columnThreshold')}: {data.trip.threshold}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {allPast ? (
              <Badge variant="secondary">{t('statusPast')}</Badge>
            ) : data.trip.active ? (
              <Badge>{t('statusActive')}</Badge>
            ) : (
              <Badge variant="outline">{t('statusPaused')}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!allPast ? (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={toggleActive}>
              {data.trip.active ? t('pause') : t('activate')}
            </Button>
          ) : null}
          <Button size="sm" variant="destructive" disabled={isPending} onClick={onDeleteTrip}>
            {t('delete')}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={data.trip.notify ? 'default' : 'outline'}
            disabled={isPending}
            onClick={() => toggleFlag('notify', !data.trip.notify)}
          >
            {tOpt('badgeNotify')}
          </Button>
          <Button
            size="sm"
            variant={data.trip.edit ? 'default' : 'outline'}
            disabled={isPending}
            onClick={() => toggleFlag('edit', !data.trip.edit)}
          >
            {tOpt('badgeEdit')}
          </Button>
        </div>

        <TicketSlot tripId={data.trip.id} ticket={data.ticket} />

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOpt('empty')}</p>
        ) : null}
        {sorted.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {sorted.map((option, idx) => {
              const past = option.eventDtstart.getTime() < Date.now()
              const state = option.lastCapacityState
              return (
                <li
                  key={option.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatDate(option.eventDtstart)} · {formatTime(option.eventDtstart)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {past
                          ? tOpt('past')
                          : option.lastCapacity == null
                            ? tOpt('notYetChecked')
                            : `${option.lastCapacity} ${tOpt(state === 'above' ? 'above' : 'below')}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={isPending || idx === 0}
                      onClick={() => onMoveOption(option.id, 'up')}
                      aria-label={tOpt('moveUp')}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={isPending || idx === sorted.length - 1}
                      onClick={() => onMoveOption(option.id, 'down')}
                      aria-label={tOpt('moveDown')}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => onRemoveOption(option.id)}
                      aria-label={tOpt('remove')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        <Link
          href={`/trips/${data.trip.id}/options`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Plus className="size-4" />
          {tOpt('addOption')}
        </Link>
      </CardContent>
    </Card>
  )
}

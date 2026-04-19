'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addOption, createJourney } from '@/actions/journeys'
import { SHIP_NAMES, type PraamidEvent } from '@/lib/praamid'

const CAPACITY_ORDER = ['sv', 'bv', 'pcs', 'mc', 'bc'] as const

export type JourneyTarget = {
  id: string
  measurementUnit: string
  threshold: number
  eventUids: string[]
}

type Props = {
  trip: PraamidEvent
  direction: string
  date: string
  journeys: JourneyTarget[]
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export function TripCard({ trip, direction, date, journeys }: Props) {
  const [target, setTarget] = useState<string>('new')
  const [capacityType, setCapacityType] = useState<string>('sv')
  const [threshold, setThreshold] = useState('1')
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('TripCard')
  const tCap = useTranslations('Capacity')

  const activeJourney = useMemo(
    () => (target === 'new' ? null : journeys.find((j) => j.id === target) ?? null),
    [target, journeys],
  )

  const effectiveCapacity = activeJourney ? activeJourney.measurementUnit : capacityType
  const alreadyOnTarget = activeJourney
    ? activeJourney.eventUids.includes(trip.uid)
    : journeys.some(
        (j) => j.measurementUnit === capacityType && j.eventUids.includes(trip.uid),
      )

  const onSubmit = () => {
    const form = new FormData()
    form.set('direction', direction)
    form.set('date', date)
    form.set('eventUid', trip.uid)

    startTransition(async () => {
      const result = activeJourney
        ? await (() => {
            form.set('journeyId', activeJourney.id)
            return addOption(form)
          })()
        : await (() => {
            form.set('measurementUnit', capacityType)
            form.set('threshold', threshold)
            return createJourney(form)
          })()
      if (result.ok) {
        toast.success(activeJourney ? t('optionAdded') : t('subscribed'))
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{formatTime(trip.dtstart)}</span>
            <span className="text-sm text-muted-foreground">→ {formatTime(trip.dtend)}</span>
            <Badge variant="outline">{SHIP_NAMES[trip.ship.code] ?? trip.ship.code}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {CAPACITY_ORDER.map((code) => {
              const v = trip.capacities[code]
              if (v == null) return null
              return (
                <span key={code} className="rounded-md bg-secondary px-2 py-0.5">
                  {tCap(code)}: <span className="font-medium text-foreground">{v}</span>
                </span>
              )
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Label className="mb-1 block text-xs">{t('target')}</Label>
            <Select value={target} onValueChange={(v) => v && setTarget(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('targetNew')}</SelectItem>
                {journeys.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {t('targetExisting', {
                      unit: tCap(j.measurementUnit as 'sv'),
                      threshold: j.threshold,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!activeJourney ? (
            <>
              <div className="w-40">
                <Label className="mb-1 block text-xs">{t('type')}</Label>
                <Select value={capacityType} onValueChange={(v) => v && setCapacityType(v)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v: string) => tCap(v as (typeof CAPACITY_ORDER)[number])}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CAPACITY_ORDER.map((code) => (
                      <SelectItem key={code} value={code}>
                        {tCap(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Label className="mb-1 block text-xs">{t('threshold')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {t('willUseUnit', { unit: tCap(effectiveCapacity as 'sv') })}
            </div>
          )}
          <Button disabled={isPending || alreadyOnTarget} onClick={onSubmit}>
            {alreadyOnTarget
              ? t('alreadySubscribed')
              : isPending
                ? t('saving')
                : activeJourney
                  ? t('addOption')
                  : t('subscribe')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

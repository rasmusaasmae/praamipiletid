'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { et, enGB } from 'react-day-picker/locale'
import { ArrowDown, ArrowRightLeft, ArrowUp, Bell, Loader2, Plus, Trash2 } from 'lucide-react'
import { useForm, useStore } from '@tanstack/react-form'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Link } from '@/i18n/navigation'
import { TicketSlot } from '@/components/ticket-slot'
import {
  deleteTrip,
  moveOption,
  removeOption,
  updateOption,
  updateTrip,
} from '@/actions/trips'
import { useOptimisticMutation } from '@/lib/mutations'
import { tripsQueryOptions, type TripCardData } from '@/lib/query-options'

export function TripCard({ data }: { data: TripCardData }) {
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

  const tripId = data.trip.id

  const toggleFlagMutation = useOptimisticMutation<
    { flag: 'notify' | 'edit'; next: boolean },
    TripCardData[]
  >({
    queryKey: tripsQueryOptions.queryKey,
    mutationFn: ({ flag, next }) =>
      updateTrip({
        id: tripId,
        ...(flag === 'notify' ? { notify: next } : { edit: next }),
      }),
    optimisticUpdate: (old, { flag, next }) =>
      old.map((c) =>
        c.trip.id === tripId ? { ...c, trip: { ...c.trip, [flag]: next } } : c,
      ),
    successMessage: t('saved'),
  })

  const deleteTripMutation = useOptimisticMutation<void, TripCardData[]>({
    queryKey: tripsQueryOptions.queryKey,
    mutationFn: () => deleteTrip({ id: tripId }),
    optimisticUpdate: (old) => old.filter((c) => c.trip.id !== tripId),
    successMessage: t('deleted'),
  })

  const removeOptionMutation = useOptimisticMutation<string, TripCardData[]>({
    queryKey: tripsQueryOptions.queryKey,
    mutationFn: (optionId) => removeOption({ id: optionId }),
    optimisticUpdate: (old, optionId) =>
      old.map((c) =>
        c.trip.id === tripId
          ? { ...c, options: c.options.filter((o) => o.id !== optionId) }
          : c,
      ),
    successMessage: tOpt('removed'),
  })

  const moveOptionMutation = useOptimisticMutation<
    { optionId: string; direction: 'up' | 'down' },
    TripCardData[]
  >({
    queryKey: tripsQueryOptions.queryKey,
    mutationFn: ({ optionId, direction }) => moveOption({ id: optionId, direction }),
    // Mirror the server's priority swap: find the neighbour in the direction
    // the user clicked (ascending sort = "up" means lower priority) and swap
    // the two priorities so the UI reorders instantly.
    optimisticUpdate: (old, { optionId, direction }) =>
      old.map((c) => {
        if (c.trip.id !== tripId) return c
        const byPriority = [...c.options].sort((a, b) => a.priority - b.priority)
        const idx = byPriority.findIndex((o) => o.id === optionId)
        if (idx === -1) return c
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= byPriority.length) return c
        const a = byPriority[idx]
        const b = byPriority[swapIdx]
        return {
          ...c,
          options: c.options.map((o) => {
            if (o.id === a.id) return { ...o, priority: b.priority }
            if (o.id === b.id) return { ...o, priority: a.priority }
            return o
          }),
        }
      }),
    successMessage: tOpt('moved'),
  })

  const updateOptionMutation = useOptimisticMutation<
    { optionId: string; stopBeforeAt: Date },
    TripCardData[]
  >({
    queryKey: tripsQueryOptions.queryKey,
    mutationFn: ({ optionId, stopBeforeAt }) =>
      updateOption({ id: optionId, stopBeforeAt: stopBeforeAt.getTime() }),
    optimisticUpdate: (old, { optionId, stopBeforeAt }) =>
      old.map((c) =>
        c.trip.id === tripId
          ? {
              ...c,
              options: c.options.map((o) =>
                o.id === optionId ? { ...o, stopBeforeAt } : o,
              ),
            }
          : c,
      ),
    successMessage: t('saved'),
  })

  const sorted = [...data.options].sort((a, b) => a.priority - b.priority)

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{tDir(data.trip.direction as 'VK')}</span>
            <Badge variant="outline">{tCap(data.trip.measurementUnit as 'sv')}</Badge>
            {data.trip.swapInProgress ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="size-3 animate-spin" />
                {t('swapping')}
              </Badge>
            ) : null}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteTripMutation.mutate()}
            aria-label={t('delete')}
            title={t('delete')}
          >
            <Trash2 className="size-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              variant="success"
              pressed={data.trip.notify}
              onPressedChange={(next) => toggleFlagMutation.mutate({ flag: 'notify', next })}
              aria-label={tOpt('badgeNotify')}
            >
              <Bell />
              {tOpt('badgeNotify')}
            </Toggle>
            <Toggle
              variant="success"
              pressed={data.trip.edit}
              onPressedChange={(next) => toggleFlagMutation.mutate({ flag: 'edit', next })}
              aria-label={tOpt('badgeEdit')}
            >
              <ArrowRightLeft />
              {tOpt('badgeEdit')}
            </Toggle>
          </div>

          <TicketSlot tripId={tripId} ticket={data.ticket} />

          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tOpt('empty')}</p>
          ) : null}
          {sorted.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {sorted.map((option, idx) => {
                const past = option.eventDtstart.getTime() < Date.now()
                const state = option.lastCapacityState
                const isCurrent = data.ticket?.eventUid === option.eventUid
                return (
                  <li
                    key={option.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              moveOptionMutation.mutate({ optionId: option.id, direction: 'up' })
                            }
                            aria-label={tOpt('moveUp')}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sorted.length - 1}
                            onClick={() =>
                              moveOptionMutation.mutate({ optionId: option.id, direction: 'down' })
                            }
                            aria-label={tOpt('moveDown')}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                          {idx + 1}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <CutoffEditor
                            eventStart={option.eventDtstart}
                            stopBeforeAt={option.stopBeforeAt}
                            disabled={past}
                            locale={locale}
                            onSave={(stopBeforeAt) =>
                              updateOptionMutation.mutate({ optionId: option.id, stopBeforeAt })
                            }
                            titleText={`${formatDate(option.eventDtstart)} · ${formatTime(option.eventDtstart)}`}
                          />
                          {isCurrent ? (
                            <Badge variant="secondary">{tOpt('current')}</Badge>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {past
                            ? tOpt('past')
                            : option.lastCapacity == null
                              ? tOpt('notYetChecked')
                              : state === 'above'
                                ? `${option.lastCapacity} ${tOpt('above')}`
                                : tOpt('below')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeOptionMutation.mutate(option.id)}
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
            href={`/trips/${tripId}/options`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Plus className="size-4" />
            {tOpt('addOption')}
          </Link>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

function startOfDay(d: Date) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function formatHHMM(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function combineDateTime(date: Date, time: string): Date | null {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const combined = new Date(date)
  combined.setHours(h, m, 0, 0)
  return combined
}

function CutoffEditor({
  eventStart,
  stopBeforeAt,
  disabled,
  locale,
  onSave,
  titleText,
}: {
  eventStart: Date
  stopBeforeAt: Date
  disabled: boolean
  locale: string
  onSave: (cutoff: Date) => void
  titleText: string
}) {
  const tOpt = useTranslations('Options')
  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const dpLocale = locale === 'et' ? et : enGB

  const sameInstant = stopBeforeAt.getTime() === eventStart.getTime()
  const sameDay =
    stopBeforeAt.getFullYear() === eventStart.getFullYear() &&
    stopBeforeAt.getMonth() === eventStart.getMonth() &&
    stopBeforeAt.getDate() === eventStart.getDate()

  const cutoffLabel = sameInstant
    ? null
    : sameDay
      ? tOpt('cutoffAt', {
          time: stopBeforeAt.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' }),
        })
      : tOpt('cutoffAtDated', {
          date: stopBeforeAt.toLocaleDateString(dateTag, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
          time: stopBeforeAt.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' }),
        })

  const [open, setOpen] = useState(false)
  const eventDayStart = startOfDay(eventStart)

  const form = useForm({
    defaultValues: {
      date: startOfDay(stopBeforeAt),
      time: formatHHMM(stopBeforeAt),
    },
    validators: {
      onChange: ({ value }) => {
        const combined = combineDateTime(value.date, value.time)
        if (!combined) return { fields: { time: 'invalid time' } }
        if (combined.getTime() >= eventStart.getTime()) {
          return tOpt('cutoffMustBeBeforeStart')
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => {
      const combined = combineDateTime(value.date, value.time)
      if (!combined) return
      setOpen(false)
      onSave(combined)
    },
  })

  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const formErrors = useStore(form.store, (s) => s.errors)

  const onOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        date: startOfDay(stopBeforeAt),
        time: formatHHMM(stopBeforeAt),
      })
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex items-baseline gap-1 rounded text-left disabled:pointer-events-none disabled:opacity-50"
                >
                  <span>{titleText}</span>
                  {cutoffLabel ? (
                    <span className="text-xs font-normal text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                      {cutoffLabel}
                    </span>
                  ) : null}
                </button>
              }
            />
          }
        />
        <TooltipContent>{tOpt('cutoffTooltip')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto">
        <PopoverHeader>
          <PopoverTitle>{tOpt('cutoffEditTitle')}</PopoverTitle>
          <PopoverDescription>{tOpt('cutoffTooltip')}</PopoverDescription>
        </PopoverHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-2"
        >
          <form.Field name="date">
            {(field) => (
              <Calendar
                mode="single"
                selected={field.state.value}
                onSelect={(d) => {
                  if (d) field.handleChange(startOfDay(d))
                }}
                disabled={(d) => d.getTime() > eventDayStart.getTime()}
                defaultMonth={field.state.value}
                locale={dpLocale}
              />
            )}
          </form.Field>
          <form.Field name="time">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label htmlFor="cutoff-time" className="text-xs">
                  {tOpt('cutoffTime')}
                </Label>
                <Input
                  id="cutoff-time"
                  type="time"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-8 text-sm tabular-nums"
                />
              </div>
            )}
          </form.Field>
          {formErrors.length > 0 ? (
            <p className="text-xs text-destructive" role="alert">
              {formErrors
                .map((err) => (typeof err === 'string' ? err : ''))
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              {tOpt('cutoffCancel')}
            </Button>
            <Button size="sm" type="submit" disabled={!canSubmit}>
              {tOpt('cutoffSave')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

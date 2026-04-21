'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
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
} from '@/actions/trips'
import { tripsCollection } from '@/lib/collections'
import type { Ticket } from '@/db/schema'

export type TripCardData = {
  trip: {
    id: string
    direction: string
    measurementUnit: string
    notify: boolean
    edit: boolean
    lastCheckedAt: Date | null
    swapInProgress: boolean
  }
  options: Array<{
    id: string
    tripId: string
    priority: number
    eventUid: string
    eventDate: string
    eventDtstart: Date
    stopBeforeAt: Date
    lastCapacity: number | null
    lastCapacityState: string | null
    lastCapacityCheckedAt: Date | null
  }>
  ticket: Ticket | null
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function formatRelative(
  nowMs: number,
  tsMs: number,
  tRel: ReturnType<typeof useTranslations<'Relative'>>,
): string {
  const diff = Math.max(0, Math.floor((nowMs - tsMs) / 1000))
  if (diff < 60) return tRel('secondsAgo', { s: diff })
  const mins = Math.floor(diff / 60)
  if (mins < 60) return tRel('minutesAgo', { m: mins })
  const hours = Math.floor(mins / 60)
  return tRel('hoursAgo', { h: hours })
}

export function TripCard({
  data,
  pollIntervalMs,
}: {
  data: TripCardData
  pollIntervalMs: number
}) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Trips')
  const tOpt = useTranslations('Options')
  const tCap = useTranslations('Capacity')
  const tDir = useTranslations('Directions')
  const tRel = useTranslations('Relative')
  const locale = useLocale()
  const now = useNow(1000)
  const staleThresholdMs = pollIntervalMs * 2

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatDate = (d: Date) =>
    d.toLocaleDateString(dateTag, { weekday: 'short', day: 'numeric', month: 'short' })
  const formatTime = (d: Date) =>
    d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })

  const submit = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) toast.success(okMsg)
      else toast.error(res.error)
    })

  const toggleFlag = (flag: 'notify' | 'edit', next: boolean) => {
    const tx = tripsCollection.update(data.trip.id, (draft) => {
      draft[flag] = next
    })
    tx.isPersisted.promise.then(
      () => toast.success(t('saved')),
      (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
    )
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

  const onSaveStopBefore = (id: string, stopBeforeAt: Date) => {
    const form = new FormData()
    form.set('id', id)
    form.set('stopBeforeAt', String(stopBeforeAt.getTime()))
    submit(() => updateOption(form), t('saved'))
  }

  const sorted = [...data.options].sort((a, b) => a.priority - b.priority)

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
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
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.trip.lastCheckedAt
                ? t('checkedAgo', {
                    ago: formatRelative(now, data.trip.lastCheckedAt.getTime(), tRel),
                  })
                : t('notYetChecked')}
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={isPending}
            onClick={onDeleteTrip}
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
              onPressedChange={(next) => toggleFlag('notify', next)}
              disabled={isPending}
              aria-label={tOpt('badgeNotify')}
            >
              <Bell />
              {tOpt('badgeNotify')}
            </Toggle>
            <Toggle
              variant="success"
              pressed={data.trip.edit}
              onPressedChange={(next) => toggleFlag('edit', next)}
              disabled={isPending}
              aria-label={tOpt('badgeEdit')}
            >
              <ArrowRightLeft />
              {tOpt('badgeEdit')}
            </Toggle>
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
                            disabled={isPending || idx === 0}
                            onClick={() => onMoveOption(option.id, 'up')}
                            aria-label={tOpt('moveUp')}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isPending || idx === sorted.length - 1}
                            onClick={() => onMoveOption(option.id, 'down')}
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
                            disabled={isPending || past}
                            locale={locale}
                            onSave={(d) => onSaveStopBefore(option.id, d)}
                            titleText={`${formatDate(option.eventDtstart)} · ${formatTime(option.eventDtstart)}`}
                          />
                          {isCurrent ? (
                            <Badge variant="secondary">{tOpt('current')}</Badge>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {past
                              ? tOpt('past')
                              : option.lastCapacity == null
                                ? tOpt('notYetChecked')
                                : state === 'above'
                                  ? `${option.lastCapacity} ${tOpt('above')}`
                                  : tOpt('below')}
                          </span>
                          {!past && option.lastCapacityCheckedAt ? (
                            <span
                              className={
                                now - option.lastCapacityCheckedAt.getTime() > staleThresholdMs
                                  ? 'tabular-nums text-amber-600 dark:text-amber-400'
                                  : 'tabular-nums'
                              }
                            >
                              ·{' '}
                              {formatRelative(
                                now,
                                option.lastCapacityCheckedAt.getTime(),
                                tRel,
                              )}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
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

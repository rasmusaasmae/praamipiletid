'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { useForm, useStore } from '@tanstack/react-form'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  moveOption,
  removeOption,
  unsubscribeTicket,
  updateOption,
} from '@/actions/tickets'
import { useOptimisticMutation } from '@/lib/mutations'
import { CAPACITY_LABELS, DIRECTION_LABELS } from '@/lib/praamid'
import { ticketsQueryOptions, type TicketCardData } from '@/lib/query-options'

const DATE_TAG = 'en-GB'

const formatDate = (d: Date) =>
  d.toLocaleDateString(DATE_TAG, { weekday: 'short', day: 'numeric', month: 'short' })
const formatTime = (d: Date) =>
  d.toLocaleTimeString(DATE_TAG, { hour: '2-digit', minute: '2-digit' })

export function TicketCard({ data }: { data: TicketCardData }) {
  const bookingUid = data.ticket.bookingUid

  const unsubscribeMutation = useOptimisticMutation<void, TicketCardData[]>({
    queryKey: ticketsQueryOptions.queryKey,
    mutationFn: () => unsubscribeTicket({ bookingUid }),
    optimisticUpdate: (old) => old.filter((c) => c.ticket.bookingUid !== bookingUid),
    successMessage: 'Deleted',
  })

  const removeOptionMutation = useOptimisticMutation<string, TicketCardData[]>({
    queryKey: ticketsQueryOptions.queryKey,
    mutationFn: (optionId) => removeOption({ id: optionId }),
    optimisticUpdate: (old, optionId) =>
      old.map((c) =>
        c.ticket.bookingUid === bookingUid
          ? { ...c, options: c.options.filter((o) => o.id !== optionId) }
          : c,
      ),
    successMessage: 'Alternative removed',
  })

  const moveOptionMutation = useOptimisticMutation<
    { optionId: string; direction: 'up' | 'down' },
    TicketCardData[]
  >({
    queryKey: ticketsQueryOptions.queryKey,
    mutationFn: ({ optionId, direction }) => moveOption({ id: optionId, direction }),
    optimisticUpdate: (old, { optionId, direction }) =>
      old.map((c) => {
        if (c.ticket.bookingUid !== bookingUid) return c
        const byPriority = [...c.options].sort((a, b) => a.priority - b.priority)
        const idx = byPriority.findIndex((o) => o.id === optionId)
        if (idx === -1) return c
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= byPriority.length) return c
        const a = byPriority[idx]!
        const b = byPriority[swapIdx]!
        return {
          ...c,
          options: c.options.map((o) => {
            if (o.id === a.id) return { ...o, priority: b.priority }
            if (o.id === b.id) return { ...o, priority: a.priority }
            return o
          }),
        }
      }),
    successMessage: 'Moved',
  })

  const updateOptionMutation = useOptimisticMutation<
    { optionId: string; stopBeforeMinutes: number },
    TicketCardData[]
  >({
    queryKey: ticketsQueryOptions.queryKey,
    mutationFn: ({ optionId, stopBeforeMinutes }) =>
      updateOption({ id: optionId, stopBeforeMinutes }),
    optimisticUpdate: (old, { optionId, stopBeforeMinutes }) =>
      old.map((c) =>
        c.ticket.bookingUid === bookingUid
          ? {
              ...c,
              options: c.options.map((o) =>
                o.id === optionId ? { ...o, stopBeforeMinutes } : o,
              ),
            }
          : c,
      ),
    successMessage: 'Saved',
  })

  const sorted = [...data.options].sort((a, b) => a.priority - b.priority)

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-lg font-semibold">
                {DIRECTION_LABELS[data.ticket.direction] ?? data.ticket.direction}
              </span>
              <Badge variant="outline">
                {CAPACITY_LABELS[data.ticket.measurementUnit] ?? data.ticket.measurementUnit}
              </Badge>
              {data.ticket.swapInProgress ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  swapping
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="truncate font-mono">{data.ticket.ticketNumber}</span>
              <span className="whitespace-nowrap">
                {formatDate(data.ticket.eventDtstart)} {formatTime(data.ticket.eventDtstart)}
              </span>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => unsubscribeMutation.mutate()}
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alternatives on this ticket yet.
            </p>
          ) : null}
          {sorted.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {sorted.map((option, idx) => {
                const past = option.eventDtstart.getTime() < Date.now()
                const isCurrent = data.ticket.eventUid === option.eventUid
                return (
                  <li
                    key={option.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() =>
                            moveOptionMutation.mutate({ optionId: option.id, direction: 'up' })
                          }
                          aria-label="Move up"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={idx === sorted.length - 1}
                          onClick={() =>
                            moveOptionMutation.mutate({
                              optionId: option.id,
                              direction: 'down',
                            })
                          }
                          aria-label="Move down"
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <CutoffEditor
                            stopBeforeMinutes={option.stopBeforeMinutes}
                            disabled={past}
                            onSave={(stopBeforeMinutes) =>
                              updateOptionMutation.mutate({
                                optionId: option.id,
                                stopBeforeMinutes,
                              })
                            }
                            titleText={`${formatDate(option.eventDtstart)} · ${formatTime(option.eventDtstart)}`}
                          />
                          {isCurrent ? <Badge variant="secondary">current</Badge> : null}
                        </span>
                        {past ? (
                          <span className="text-xs text-muted-foreground">Past</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeOptionMutation.mutate(option.id)}
                        aria-label="Remove alternative"
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
            href={`/tickets/${bookingUid}/options`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Plus className="size-4" />
            Add alternative
          </Link>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

function CutoffEditor({
  stopBeforeMinutes,
  disabled,
  onSave,
  titleText,
}: {
  stopBeforeMinutes: number
  disabled: boolean
  onSave: (minutes: number) => void
  titleText: string
}) {
  const [open, setOpen] = useState(false)

  const form = useForm({
    defaultValues: { minutes: stopBeforeMinutes },
    validators: {
      onChange: ({ value }) => {
        if (!Number.isFinite(value.minutes) || value.minutes < 0) {
          return 'Must be a non-negative number'
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => {
      setOpen(false)
      onSave(Math.floor(value.minutes))
    },
  })

  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const formErrors = useStore(form.store, (s) => s.errors)

  const onOpenChange = (next: boolean) => {
    if (next) form.reset({ minutes: stopBeforeMinutes })
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
                  <span className="text-xs font-normal text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                    stop {stopBeforeMinutes} min before
                  </span>
                </button>
              }
            />
          }
        />
        <TooltipContent>
          We stop auto-swapping this alternative this many minutes before its departure.
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto">
        <PopoverHeader>
          <PopoverTitle>Stop swapping</PopoverTitle>
          <PopoverDescription>
            We stop auto-swapping this alternative this many minutes before its departure.
          </PopoverDescription>
        </PopoverHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-2"
        >
          <form.Field name="minutes">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label htmlFor="cutoff-minutes" className="text-xs">
                  Minutes before departure
                </Label>
                <Input
                  id="cutoff-minutes"
                  type="number"
                  min={0}
                  step={5}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  className="h-8 w-28 text-sm tabular-nums"
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
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!canSubmit}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

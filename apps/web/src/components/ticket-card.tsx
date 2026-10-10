'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { moveOption, removeOption, updateOption } from '@/actions/options'
import { CutoffEditor } from '@/components/cutoff-editor'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CAPACITY_LABELS, DIRECTION_LABELS } from '@/lib/labels'
import type { TicketWithOptions } from '@/lib/queries'

const DATE_TAG = 'en-GB'

const formatDate = (d: Date) =>
  d.toLocaleDateString(DATE_TAG, { weekday: 'short', day: 'numeric', month: 'short' })
const formatTime = (d: Date) =>
  d.toLocaleTimeString(DATE_TAG, { hour: '2-digit', minute: '2-digit' })

export function TicketCard({ data }: { data: TicketWithOptions }) {
  const ticketId = data.ticket.id
  const queryClient = useQueryClient()

  const invalidateTickets = () => queryClient.invalidateQueries({ queryKey: ['tickets'] })

  const removeOptionMutation = useMutation({
    mutationFn: (optionId: string) => removeOption({ id: optionId }),
    onSuccess: () => {
      void invalidateTickets()
      toast.success('Alternative removed')
    },
    onError: (err) => toast.error(err.message),
  })

  const moveOptionMutation = useMutation({
    mutationFn: (vars: { optionId: string; direction: 'up' | 'down' }) =>
      moveOption({ id: vars.optionId, direction: vars.direction }),
    onSuccess: () => {
      void invalidateTickets()
      toast.success('Moved')
    },
    onError: (err) => toast.error(err.message),
  })

  const updateOptionMutation = useMutation({
    mutationFn: (vars: { optionId: string; stopBeforeMinutes: number }) =>
      updateOption({ id: vars.optionId, stopBeforeMinutes: vars.stopBeforeMinutes }),
    onSuccess: () => {
      void invalidateTickets()
      toast.success('Saved')
    },
    onError: (err) => toast.error(err.message),
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
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className="truncate font-mono">{data.ticket.ticketNumber}</span>
              <span className="whitespace-nowrap">
                {formatDate(data.ticket.eventDtstart)} {formatTime(data.ticket.eventDtstart)}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">No alternatives on this ticket yet.</p>
          ) : null}
          {sorted.length > 0 ? (
            <ul className="divide-border border-border flex flex-col divide-y rounded-md border">
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
                          disabled={idx === 0 || moveOptionMutation.isPending}
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
                          disabled={idx === sorted.length - 1 || moveOptionMutation.isPending}
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
                      <span className="bg-muted inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <CutoffEditor
                            stopBeforeMinutes={option.stopBeforeMinutes}
                            disabled={past || updateOptionMutation.isPending}
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
                        {past ? <span className="text-muted-foreground text-xs">Past</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={removeOptionMutation.isPending}
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
            href={`/tickets/${ticketId}/options`}
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

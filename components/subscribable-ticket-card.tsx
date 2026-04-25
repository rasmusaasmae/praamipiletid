'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ticket as TicketIcon } from 'lucide-react'
import { toast } from 'sonner'

import { subscribeTicket } from '@/actions/tickets'
import type { LiveTicket } from '@/actions/tickets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DIRECTION_LABELS } from '@/lib/praamid/labels'

type Props = {
  ticket: LiveTicket
}

const DATE_TAG = 'en-GB'

export function SubscribableTicketCard({ ticket }: Props) {
  const queryClient = useQueryClient()

  const start = new Date(ticket.eventDtstart)
  const dateLabel = start.toLocaleDateString(DATE_TAG, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeLabel = start.toLocaleTimeString(DATE_TAG, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const subscribeMutation = useMutation({
    mutationFn: () =>
      subscribeTicket({ bookingUid: ticket.bookingUid, ticketCode: ticket.ticketCode }),
    onSuccess: () => {
      toast.success('Now monitoring')
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['praamidTickets'] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card>
      <CardContent className="flex flex-col items-stretch gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <TicketIcon className="text-muted-foreground size-4 shrink-0" />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">
                {DIRECTION_LABELS[ticket.direction] ?? ticket.direction}
              </span>
              <Badge variant="outline">{dateLabel}</Badge>
              <span className="text-sm tabular-nums">{timeLabel}</span>
            </div>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {ticket.ticketNumber}
            </span>
          </div>
        </div>
        <Button
          disabled={subscribeMutation.isPending}
          onClick={() => subscribeMutation.mutate()}
          className="sm:self-center"
        >
          {subscribeMutation.isPending ? 'Adding…' : 'Monitor'}
        </Button>
      </CardContent>
    </Card>
  )
}

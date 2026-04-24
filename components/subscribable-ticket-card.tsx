'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Ticket as TicketIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { subscribeTicket } from '@/actions/tickets'
import type { LiveTicket } from '@/actions/tickets'
import { ticketsQueryOptions } from '@/lib/query-options'

type Props = {
  ticket: LiveTicket
}

export function SubscribableTicketCard({ ticket }: Props) {
  const t = useTranslations('Home')
  const tDir = useTranslations('Directions')
  const locale = useLocale()
  const queryClient = useQueryClient()

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const start = new Date(ticket.eventDtstart)
  const dateLabel = start.toLocaleDateString(dateTag, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeLabel = start.toLocaleTimeString(dateTag, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const subscribeMutation = useMutation({
    mutationFn: () =>
      subscribeTicket({ bookingUid: ticket.bookingUid, ticketCode: ticket.ticketCode }),
    onSuccess: () => {
      toast.success(t('subscribed'))
      queryClient.invalidateQueries({ queryKey: ticketsQueryOptions.queryKey })
      queryClient.invalidateQueries({ queryKey: ['praamidTickets'] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card>
      <CardContent className="flex flex-col items-stretch gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <TicketIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{tDir(ticket.direction as 'VK')}</span>
              <Badge variant="outline">{dateLabel}</Badge>
              <span className="text-sm tabular-nums">{timeLabel}</span>
            </div>
            <span className="truncate text-xs font-mono text-muted-foreground">
              {ticket.ticketNumber}
            </span>
          </div>
        </div>
        <Button
          disabled={subscribeMutation.isPending}
          onClick={() => subscribeMutation.mutate()}
          className="sm:self-center"
        >
          {subscribeMutation.isPending ? t('subscribing') : t('subscribe')}
        </Button>
      </CardContent>
    </Card>
  )
}

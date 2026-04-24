'use client'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { TicketCard } from '@/components/ticket-card'
import { SubscribableTicketCard } from '@/components/subscribable-ticket-card'
import { Card, CardContent } from '@/components/ui/card'
import { refreshTickets } from '@/actions/tickets'
import { ticketsQueryOptions } from '@/lib/query-options'

export function Home() {
  const tH = useTranslations('Home')
  const tT = useTranslations('Tickets')

  const { data: cards } = useSuspenseQuery({
    ...ticketsQueryOptions,
    refetchInterval: 60_000,
  })

  const liveTickets = useQuery({
    queryKey: ['praamidTickets'],
    queryFn: () => refreshTickets(),
    staleTime: 60_000,
    retry: false,
  })

  const subscribedBookingUids = new Set(cards.map((c) => c.ticket.bookingUid))
  const unsubscribed = (liveTickets.data ?? []).filter(
    (lt) => !subscribedBookingUids.has(lt.bookingUid),
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{tT('title')}</h2>
        <p className="text-sm text-muted-foreground">{tT('description')}</p>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">{tT('empty')}</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <TicketCard key={card.ticket.bookingUid} data={card} />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{tH('availableTitle')}</h3>
        <p className="text-sm text-muted-foreground">{tH('availableDescription')}</p>
      </div>

      {liveTickets.isLoading ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">{tH('loading')}</CardContent>
        </Card>
      ) : liveTickets.error ? (
        <Card>
          <CardContent className="py-6 text-destructive">
            {liveTickets.error.message}
          </CardContent>
        </Card>
      ) : unsubscribed.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {tH('noAvailable')}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {unsubscribed.map((ticket) => (
            <SubscribableTicketCard
              key={ticket.bookingUid}
              ticket={ticket}
              alreadySubscribed={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

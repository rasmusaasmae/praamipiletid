'use client'

import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { TicketCard } from '@/components/ticket-card'
import { SubscribableTicketCard } from '@/components/subscribable-ticket-card'
import {
  PraamidAuthCard,
  type PraamidCredentialMeta,
} from '@/components/praamid-auth-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { LiveTicket } from '@/actions/tickets'
import { refreshTickets } from '@/actions/tickets'
import {
  praamidAuthStateQueryOptions,
  ticketsQueryOptions,
  type TicketCardData,
} from '@/lib/query-options'

type Row =
  | { kind: 'subscribed'; bookingUid: string; eventDtstart: Date; data: TicketCardData }
  | { kind: 'live'; bookingUid: string; eventDtstart: Date; data: LiveTicket }

export function Home({
  configured,
  credentialMeta,
}: {
  configured: boolean
  credentialMeta: PraamidCredentialMeta | null
}) {
  const tT = useTranslations('Tickets')

  const { data: cards } = useSuspenseQuery({
    ...ticketsQueryOptions,
    refetchInterval: 60_000,
  })

  const authState = useQuery(praamidAuthStateQueryOptions)
  const isAuthed = authState.data?.status === 'authenticated'

  const liveTickets = useQuery({
    queryKey: ['praamidTickets'],
    queryFn: () => refreshTickets(),
    staleTime: 60_000,
    retry: false,
    enabled: configured && isAuthed,
  })

  const rows = useMemo<Row[]>(() => {
    const subscribed = new Set(cards.map((c) => c.ticket.bookingUid))
    const live = (liveTickets.data ?? []).filter((lt) => !subscribed.has(lt.bookingUid))
    return [
      ...cards.map<Row>((c) => ({
        kind: 'subscribed',
        bookingUid: c.ticket.bookingUid,
        eventDtstart: c.ticket.eventDtstart,
        data: c,
      })),
      ...live.map<Row>((lt) => ({
        kind: 'live',
        bookingUid: lt.bookingUid,
        eventDtstart: new Date(lt.eventDtstart),
        data: lt,
      })),
    ].sort((a, b) => a.eventDtstart.getTime() - b.eventDtstart.getTime())
  }, [cards, liveTickets.data])

  return (
    <div className="flex flex-col gap-6">
      {configured ? (
        <PraamidAuthCard credentialMeta={credentialMeta} />
      ) : (
        <PraamidNotConfiguredCard />
      )}

      <div>
        <h2 className="text-2xl font-semibold">{tT('title')}</h2>
        <p className="text-sm text-muted-foreground">{tT('description')}</p>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-4">
          {rows.map((row) =>
            row.kind === 'subscribed' ? (
              <TicketCard key={row.bookingUid} data={row.data} />
            ) : (
              <SubscribableTicketCard key={row.bookingUid} ticket={row.data} />
            ),
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {tT('empty')}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PraamidNotConfiguredCard() {
  const tP = useTranslations('Praamid')
  return (
    <Card id="praamid" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{tP('title')}</CardTitle>
        <CardDescription>{tP('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-destructive">{tP('notConfigured')}</p>
      </CardContent>
    </Card>
  )
}

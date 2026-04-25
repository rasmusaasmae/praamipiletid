'use client'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useMemo } from 'react'

import type { LiveTicket } from '@/actions/tickets'
import { refreshTickets } from '@/actions/tickets'
import { PraamidAuthCard, type PraamidCredentialMeta } from '@/components/praamid-auth-card'
import { SubscribableTicketCard } from '@/components/subscribable-ticket-card'
import { TicketCard } from '@/components/ticket-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getMyPraamidAuthState, getTicketsWithOptions, type TicketWithOptions } from '@/lib/queries'

type Row =
  | { kind: 'subscribed'; bookingUid: string; eventDtstart: Date; data: TicketWithOptions }
  | { kind: 'live'; bookingUid: string; eventDtstart: Date; data: LiveTicket }

export function Home({
  configured,
  credentialMeta,
}: {
  configured: boolean
  credentialMeta: PraamidCredentialMeta | null
}) {
  const { data: cards } = useSuspenseQuery({
    queryKey: ['tickets'],
    queryFn: () => getTicketsWithOptions(),
    refetchInterval: 60_000,
  })

  const authState = useQuery({
    queryKey: ['praamidAuthState'],
    queryFn: () => getMyPraamidAuthState(),
  })
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
        <h2 className="text-2xl font-semibold">My tickets</h2>
        <p className="text-muted-foreground text-sm">
          Monitored tickets and their preferred alternatives.
        </p>
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
      ) : !isAuthed ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col gap-2 py-6 text-sm">
            <p>You&apos;re not connected to praamid.ee yet.</p>
            <Link href="/#praamid" className="hover:text-foreground underline">
              Connect praamid.ee
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No active tickets on praamid.ee.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PraamidNotConfiguredCard() {
  return (
    <Card id="praamid" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>praamid.ee</CardTitle>
        <CardDescription>
          We replay your praamid.ee session to auto-update tickets when a better slot opens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-destructive text-sm">
          Credential encryption key is not configured on the server.
        </p>
      </CardContent>
    </Card>
  )
}

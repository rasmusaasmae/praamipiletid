'use client'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { PraamidAuthCard } from '@/components/praamid-auth'
import { TicketCard } from '@/components/ticket-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getMyPraamidAuthState, getTicketsWithOptions } from '@/lib/queries'

export function Home({ configured }: { configured: boolean }) {
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

  return (
    <div className="flex flex-col gap-6">
      {configured ? <PraamidAuthCard /> : <PraamidNotConfiguredCard />}

      <div>
        <h2 className="text-2xl font-semibold">My tickets</h2>
        <p className="text-muted-foreground text-sm">
          Monitored tickets and their preferred alternatives.
        </p>
      </div>

      {cards.length > 0 ? (
        <div className="flex flex-col gap-4">
          {cards.map((c) => (
            <TicketCard key={c.ticket.id} data={c} />
          ))}
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

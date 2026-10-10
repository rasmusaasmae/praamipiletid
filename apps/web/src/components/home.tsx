import { useSuspenseQuery } from '@tanstack/react-query'

import { PraamidAuthCard } from '@/components/praamid-auth'
import { TicketCard } from '@/components/ticket-card'
import { Card, CardContent } from '@/components/ui/card'
import { praamidLoginQuery, ticketsQuery } from '@/lib/api'

export function Home() {
  const { data: cards } = useSuspenseQuery(ticketsQuery)
  const { data: login } = useSuspenseQuery(praamidLoginQuery)
  const isAuthed = login.status === 'authenticated'

  return (
    <div className="flex flex-col gap-6">
      <PraamidAuthCard />

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
            <a href="#praamid" className="hover:text-foreground underline">
              Connect praamid.ee
            </a>
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

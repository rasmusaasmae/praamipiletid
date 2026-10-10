import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PraamidAuthCard } from '@/components/praamid-auth'
import { TicketCard } from '@/components/ticket-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api, praamidLoginQuery, ticketsQuery } from '@/lib/api'

export function Home() {
  const queryClient = useQueryClient()
  const { data: login } = useSuspenseQuery(praamidLoginQuery)
  const isAuthed = login.status === 'authenticated'
  // The worker syncs on its next cycle and the change stream announces it.
  // While waiting, also poll, so a proxy that holds the stream back can't
  // leave the page stuck on "Refreshing".
  const {
    data: { syncedAt, tickets: cards },
  } = useSuspenseQuery({
    ...ticketsQuery,
    refetchInterval: (query) => (isAuthed && query.state.data?.syncedAt === null ? 2000 : false),
  })

  const sync = useMutation({
    mutationFn: api.syncTickets,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    onError: (err) => toast.error(err.message),
  })
  const refreshing = isAuthed && (sync.isPending || syncedAt === null)

  // Re-renders now and then to keep "last refreshed" current.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PraamidAuthCard />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">My tickets</h2>
          <p className="text-muted-foreground text-sm">
            Monitored tickets and their preferred alternatives.
          </p>
          {refreshing ? (
            <p className="text-muted-foreground text-xs">Refreshing from praamid.ee…</p>
          ) : syncedAt ? (
            <p className="text-muted-foreground text-xs" title={syncedAt.toLocaleString()}>
              Last refreshed {formatDistanceToNow(syncedAt, { addSuffix: true })}
            </p>
          ) : null}
        </div>
        {isAuthed ? (
          <Button variant="outline" size="sm" disabled={refreshing} onClick={() => sync.mutate()}>
            <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        ) : null}
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

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'

import { EventCard } from '@/components/event-card'
import { OptionsDateFilter } from '@/components/options-date-filter'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { departuresQuery, ticketsQuery } from '@/lib/api'
import { CAPACITY_LABELS, DIRECTION_LABELS } from '@/lib/labels'

const route = getRouteApi('/app/tickets/$ticketId/options')

// The departure's day in Estonia, where the ferries run.
const isoDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' })

export function AddOptionPage() {
  const { ticketId } = route.useParams()
  const search = route.useSearch()
  const { data: all } = useSuspenseQuery(ticketsQuery)
  const entry = all.find((t) => t.ticket.id === ticketId)

  const date =
    search.date ??
    entry?.options[0]?.eventDate ??
    (entry ? isoDay(entry.ticket.eventDtstart) : isoDay(new Date()))
  const departures = useQuery({ ...departuresQuery(ticketId, date), enabled: Boolean(entry) })

  if (!entry) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-destructive text-sm">Ticket not found.</p>
          <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
            Back to tickets
          </Link>
        </CardContent>
      </Card>
    )
  }

  const { ticket } = entry
  const taken = new Set(entry.options.map((o) => o.eventUid))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/" className="text-muted-foreground text-sm hover:underline">
          ← Back to tickets
        </Link>
        <h1 className="text-2xl font-semibold">Add alternative</h1>
        <p className="text-muted-foreground text-sm">
          {DIRECTION_LABELS[ticket.direction] ?? ticket.direction} ·{' '}
          {CAPACITY_LABELS[ticket.measurementUnit] ?? ticket.measurementUnit}
        </p>
      </div>

      <OptionsDateFilter ticketId={ticket.id} currentDate={date} />

      {departures.isError ? (
        <Card>
          <CardContent className="text-destructive py-6">
            Could not load the ferry schedule. Try again in a moment.
          </CardContent>
        </Card>
      ) : departures.isPending ? (
        <Card>
          <CardContent className="text-muted-foreground py-6">Loading departures…</CardContent>
        </Card>
      ) : departures.data.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6">
            No departures on this date.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {departures.data.map((event) => (
            <EventCard
              key={event.uid}
              event={event}
              ticketId={ticket.id}
              date={date}
              measurementUnit={ticket.measurementUnit}
              alreadyAdded={taken.has(event.uid) || event.uid === ticket.eventUid}
            />
          ))}
        </div>
      )}
    </div>
  )
}

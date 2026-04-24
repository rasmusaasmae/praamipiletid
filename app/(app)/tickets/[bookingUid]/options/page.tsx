import { and, asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { CAPACITY_LABELS, DIRECTION_LABELS, listEvents } from '@/lib/praamid'
import { requireUser } from '@/lib/session'
import { EventCard } from '@/components/event-card'
import { OptionsDateFilter } from '@/components/options-date-filter'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

const DIRECTION_CODES = ['VK', 'KV', 'RH', 'HR'] as const
type DirectionCode = (typeof DIRECTION_CODES)[number]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type RouteParams = Promise<{ bookingUid: string }>
type SearchParams = Promise<Record<string, string | undefined>>

export default async function AddOptionPage({
  params,
  searchParams,
}: {
  params: RouteParams
  searchParams: SearchParams
}) {
  const session = await requireUser()
  const { bookingUid } = await params
  const query = await searchParams

  const [ticket] = await db
    .select({
      bookingUid: tickets.bookingUid,
      direction: tickets.direction,
      measurementUnit: tickets.measurementUnit,
      eventDtstart: tickets.eventDtstart,
    })
    .from(tickets)
    .where(
      and(eq(tickets.userId, session.user.id), eq(tickets.bookingUid, bookingUid)),
    )
    .limit(1)

  if (!ticket) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-destructive">Ticket not found.</p>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            Back to tickets
          </Link>
        </CardContent>
      </Card>
    )
  }

  const direction = ticket.direction as DirectionCode

  const existingOptions = await db
    .select({ eventUid: ticketOptions.eventUid, eventDate: ticketOptions.eventDate })
    .from(ticketOptions)
    .where(eq(ticketOptions.bookingUid, ticket.bookingUid))
    .orderBy(asc(ticketOptions.priority))
  const takenUids = new Set(existingOptions.map((o) => o.eventUid))

  const fallbackDate =
    existingOptions[0]?.eventDate ?? toIsoDate(ticket.eventDtstart) ?? todayIso()
  const date =
    query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : fallbackDate

  let events: Awaited<ReturnType<typeof listEvents>> = []
  let error: string | null = null
  try {
    events = await listEvents(direction, date)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load ferry schedule'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to tickets
        </Link>
        <h1 className="text-2xl font-semibold">Add alternative</h1>
        <p className="text-sm text-muted-foreground">
          {DIRECTION_LABELS[direction] ?? direction} ·{' '}
          {CAPACITY_LABELS[ticket.measurementUnit] ?? ticket.measurementUnit}
        </p>
      </div>

      <OptionsDateFilter bookingUid={ticket.bookingUid} currentDate={date} />

      {error ? (
        <Card>
          <CardContent className="py-6 text-destructive">{error}</CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            No events found for this date.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventCard
              key={event.uid}
              event={event}
              bookingUid={ticket.bookingUid}
              date={date}
              measurementUnit={ticket.measurementUnit}
              alreadyAdded={takenUids.has(event.uid)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

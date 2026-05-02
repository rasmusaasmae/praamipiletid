import { and, asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EventCard } from '@/components/event-card'
import { OptionsDateFilter } from '@/components/options-date-filter'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { auth } from '@/lib/auth'
import { CAPACITY_LABELS, DIRECTION_LABELS } from '@/lib/labels'
import { praamidee } from '@/lib/praamidee'

const DIRECTION_CODES = ['VK', 'KV', 'RH', 'HR'] as const
type DirectionCode = (typeof DIRECTION_CODES)[number]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type RouteParams = Promise<{ ticketId: string }>
type SearchParams = Promise<Record<string, string | undefined>>

export default async function AddOptionPage({
  params,
  searchParams,
}: {
  params: RouteParams
  searchParams: SearchParams
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')
  const { ticketId: ticketIdRaw } = await params
  const ticketId = Number(ticketIdRaw)
  const query = await searchParams

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-destructive text-sm">Invalid ticket id.</p>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            Back to tickets
          </Link>
        </CardContent>
      </Card>
    )
  }

  const [ticket] = await db
    .select({
      id: tickets.id,
      direction: tickets.direction,
      measurementUnit: tickets.measurementUnit,
      eventDtstart: tickets.eventDtstart,
    })
    .from(tickets)
    .where(and(eq(tickets.userId, session.user.id), eq(tickets.id, ticketId)))
    .limit(1)

  if (!ticket) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-destructive text-sm">Ticket not found.</p>
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
    .where(eq(ticketOptions.ticketId, ticket.id))
    .orderBy(asc(ticketOptions.priority))
  const takenUids = new Set(existingOptions.map((o) => o.eventUid))

  const fallbackDate = existingOptions[0]?.eventDate ?? toIsoDate(ticket.eventDtstart) ?? todayIso()
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : fallbackDate

  let events: Awaited<ReturnType<typeof praamidee.event.list>> = []
  let error: string | null = null
  try {
    events = await praamidee.event.list(direction, date)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load ferry schedule'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Back to tickets
        </Link>
        <h1 className="text-2xl font-semibold">Add alternative</h1>
        <p className="text-muted-foreground text-sm">
          {DIRECTION_LABELS[direction] ?? direction} ·{' '}
          {CAPACITY_LABELS[ticket.measurementUnit] ?? ticket.measurementUnit}
        </p>
      </div>

      <OptionsDateFilter ticketId={ticket.id} currentDate={date} />

      {error ? (
        <Card>
          <CardContent className="text-destructive py-6">{error}</CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6">
            No events found for this date.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventCard
              key={event.uid}
              event={event}
              ticketId={ticket.id}
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

import { and, asc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { requireUser } from '@/lib/session'
import { Link } from '@/i18n/navigation'
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

type RouteParams = Promise<{ bookingUid: string; locale: string }>
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
  const t = await getTranslations('AddOption')
  const tDir = await getTranslations('Directions')
  const tCap = await getTranslations('Capacity')

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
          <p className="text-sm text-destructive">{t('ticketNotFound')}</p>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            {t('backHome')}
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
    error = err instanceof Error ? err.message : t('loadError')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← {t('backHome')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {tDir(direction)} · {tCap(ticket.measurementUnit as 'sv')}
        </p>
      </div>

      <OptionsDateFilter bookingUid={ticket.bookingUid} currentDate={date} />

      {error ? (
        <Card>
          <CardContent className="py-6 text-destructive">{error}</CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">{t('empty')}</CardContent>
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

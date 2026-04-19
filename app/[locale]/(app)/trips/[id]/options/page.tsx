import { and, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { tripOptions, trips } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { requireUser } from '@/lib/session'
import { Link } from '@/i18n/navigation'
import { TripsFilter } from '@/components/trips-filter'
import { EventCard } from '@/components/event-card'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

const DIRECTION_CODES = ['VK', 'KV', 'RH', 'HR'] as const
type DirectionCode = (typeof DIRECTION_CODES)[number]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type RouteParams = Promise<{ id: string; locale: string }>
type SearchParams = Promise<Record<string, string | undefined>>

export default async function AddOptionPage({
  params,
  searchParams,
}: {
  params: RouteParams
  searchParams: SearchParams
}) {
  const session = await requireUser()
  const { id: tripId } = await params
  const query = await searchParams
  const t = await getTranslations('AddOption')
  const tDir = await getTranslations('Directions')
  const tCap = await getTranslations('Capacity')

  const directions = DIRECTION_CODES.map((code) => ({ code, label: tDir(code) }))

  const trip = await db
    .select({
      id: trips.id,
      direction: trips.direction,
      measurementUnit: trips.measurementUnit,
    })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, session.user.id)))
    .get()

  if (!trip) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-destructive">{t('tripNotFound')}</p>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            {t('backHome')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  const direction = trip.direction as DirectionCode
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayIso()

  let events: Awaited<ReturnType<typeof listEvents>> = []
  let error: string | null = null
  try {
    events = await listEvents(direction, date)
  } catch (err) {
    error = err instanceof Error ? err.message : t('loadError')
  }

  const existingOptions = await db
    .select({ eventUid: tripOptions.eventUid })
    .from(tripOptions)
    .where(eq(tripOptions.tripId, trip.id))
    .all()
  const takenUids = new Set(existingOptions.map((o) => o.eventUid))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← {t('backHome')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {tDir(direction)} · {tCap(trip.measurementUnit as 'sv')}
        </p>
      </div>

      <TripsFilter
        directions={directions}
        currentDirection={direction}
        currentDate={date}
        tripId={trip.id}
        directionLocked
      />

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
              tripId={trip.id}
              date={date}
              measurementUnit={trip.measurementUnit}
              alreadyAdded={takenUids.has(event.uid)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

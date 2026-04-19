import { and, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { journeyOptions, journeys } from '@/db/schema'
import { listEvents } from '@/lib/praamid'
import { requireUser } from '@/lib/session'
import { TripsFilter } from '@/components/trips-filter'
import { TripCard, type JourneyTarget } from '@/components/trip-card'
import { Card, CardContent } from '@/components/ui/card'

const DIRECTION_CODES = ['VK', 'KV', 'RH', 'HR'] as const

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type SearchParams = Promise<Record<string, string | undefined>>

export default async function TripsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireUser()
  const params = await searchParams
  const direction = (DIRECTION_CODES as readonly string[]).includes(params.direction ?? '')
    ? (params.direction as string)
    : 'HR'
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayIso()

  const t = await getTranslations('TripsPage')
  const tDir = await getTranslations('Directions')
  const directions = DIRECTION_CODES.map((code) => ({ code, label: tDir(code) }))

  let events: Awaited<ReturnType<typeof listEvents>> = []
  let error: string | null = null
  try {
    events = await listEvents(direction, date)
  } catch (err) {
    error = err instanceof Error ? err.message : t('loadError')
  }

  const myJourneys = await db
    .select({
      id: journeys.id,
      measurementUnit: journeys.measurementUnit,
      threshold: journeys.threshold,
    })
    .from(journeys)
    .where(and(eq(journeys.userId, session.user.id), eq(journeys.direction, direction)))
    .all()

  const myOptions = myJourneys.length
    ? await db
        .select({
          journeyId: journeyOptions.journeyId,
          eventUid: journeyOptions.eventUid,
        })
        .from(journeyOptions)
        .innerJoin(journeys, eq(journeys.id, journeyOptions.journeyId))
        .where(eq(journeys.userId, session.user.id))
        .all()
    : []

  const optionsByJourney = new Map<string, Set<string>>()
  for (const o of myOptions) {
    const set = optionsByJourney.get(o.journeyId) ?? new Set<string>()
    set.add(o.eventUid)
    optionsByJourney.set(o.journeyId, set)
  }

  const targets: JourneyTarget[] = myJourneys.map((j) => ({
    id: j.id,
    measurementUnit: j.measurementUnit,
    threshold: j.threshold,
    eventUids: [...(optionsByJourney.get(j.id) ?? [])],
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <TripsFilter directions={directions} currentDirection={direction} currentDate={date} />

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
            <TripCard
              key={event.uid}
              trip={event}
              direction={direction}
              date={date}
              journeys={targets}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { asc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { db } from '@/db'
import { tripOptions, trips, tickets } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { TripCard, type TripCardData } from '@/components/trip-card'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export default async function HomePage() {
  const session = await requireUser()
  const t = await getTranslations('Home')
  const tT = await getTranslations('Trips')

  const [tripRows, optionRows, ticketRows] = await Promise.all([
    db
      .select({
        id: trips.id,
        direction: trips.direction,
        measurementUnit: trips.measurementUnit,
        notify: trips.notify,
        edit: trips.edit,
      })
      .from(trips)
      .where(eq(trips.userId, session.user.id)),
    db
      .select({
        id: tripOptions.id,
        tripId: tripOptions.tripId,
        priority: tripOptions.priority,
        eventUid: tripOptions.eventUid,
        eventDate: tripOptions.eventDate,
        eventDtstart: tripOptions.eventDtstart,
        stopBeforeAt: tripOptions.stopBeforeAt,
        lastCapacity: tripOptions.lastCapacity,
        lastCapacityState: tripOptions.lastCapacityState,
      })
      .from(tripOptions)
      .innerJoin(trips, eq(trips.id, tripOptions.tripId))
      .where(eq(trips.userId, session.user.id))
      .orderBy(asc(tripOptions.priority)),
    db
      .select()
      .from(tickets)
      .innerJoin(trips, eq(trips.id, tickets.tripId))
      .where(eq(trips.userId, session.user.id)),
  ])

  const optionsByTrip = new Map<string, (typeof optionRows)[number][]>()
  for (const o of optionRows) {
    const list = optionsByTrip.get(o.tripId) ?? []
    list.push(o)
    optionsByTrip.set(o.tripId, list)
  }
  const ticketByTrip = new Map(ticketRows.map((r) => [r.tickets.tripId, r.tickets]))

  const cards: TripCardData[] = tripRows
    .map((trip) => ({
      trip,
      options: optionsByTrip.get(trip.id) ?? [],
      ticket: ticketByTrip.get(trip.id) ?? null,
    }))
    .sort((a, b) => {
      const aNext = a.options[0]?.eventDtstart.getTime() ?? Infinity
      const bNext = b.options[0]?.eventDtstart.getTime() ?? Infinity
      return aNext - bNext
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{tT('title')}</h2>
          <p className="text-sm text-muted-foreground">{tT('description')}</p>
        </div>
        <Link href="/trips/new" className={buttonVariants()}>
          <Plus className="size-4" />
          {t('addTrip')}
        </Link>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {tT('empty')}{' '}
            <Link className="underline" href="/trips/new">
              {tT('emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <TripCard key={card.trip.id} data={card} />
          ))}
        </div>
      )}
    </div>
  )
}

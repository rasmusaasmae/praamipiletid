'use client'

import { useLiveQuery } from '@tanstack/react-db'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { TripCard, type TripCardData } from '@/components/trip-card'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import {
  ticketsCollection,
  tripOptionsCollection,
  tripsCollection,
  type TicketRow,
  type TripOptionRow,
  type TripRow,
} from '@/lib/collections'
import type { Ticket } from '@/db/schema'

function toOption(row: TripOptionRow): TripCardData['options'][number] {
  return {
    id: row.id,
    tripId: row.trip_id,
    priority: row.priority,
    eventUid: row.event_uid,
    eventDate: row.event_date,
    eventDtstart: row.event_dtstart,
    stopBeforeAt: row.stop_before_at,
    lastCapacity: row.last_capacity,
    lastCapacityState: row.last_capacity_state,
  }
}

function toTicket(row: TicketRow): Ticket {
  return {
    tripId: row.trip_id,
    userId: row.user_id,
    ticketCode: row.ticket_code,
    ticketNumber: row.ticket_number,
    bookingUid: row.booking_uid,
    eventUid: row.event_uid,
    ticketDate: row.ticket_date,
    eventDtstart: row.event_dtstart,
    capturedAt: row.captured_at,
    updatedAt: row.updated_at,
  }
}

function toCard(trip: TripRow, options: TripOptionRow[], ticket: TicketRow | null): TripCardData {
  return {
    trip: {
      id: trip.id,
      direction: trip.direction,
      measurementUnit: trip.measurement_unit,
      notify: trip.notify,
      edit: trip.edit,
    },
    options: [...options]
      .sort((a, b) => a.priority - b.priority)
      .map(toOption),
    ticket: ticket ? toTicket(ticket) : null,
  }
}

export default function HomePage() {
  const t = useTranslations('Home')
  const tT = useTranslations('Trips')

  const { data: trips } = useLiveQuery((q) => q.from({ t: tripsCollection }))
  const { data: options } = useLiveQuery((q) => q.from({ o: tripOptionsCollection }))
  const { data: tickets } = useLiveQuery((q) => q.from({ tk: ticketsCollection }))

  const optionsByTrip = new Map<string, TripOptionRow[]>()
  for (const o of options) {
    const list = optionsByTrip.get(o.trip_id) ?? []
    list.push(o)
    optionsByTrip.set(o.trip_id, list)
  }
  const ticketByTrip = new Map(tickets.map((r) => [r.trip_id, r]))

  const cards: TripCardData[] = trips
    .map((trip) => toCard(trip, optionsByTrip.get(trip.id) ?? [], ticketByTrip.get(trip.id) ?? null))
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

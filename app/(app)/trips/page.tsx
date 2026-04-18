import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { listTrips } from '@/lib/praamid'
import { requireUser } from '@/lib/session'
import { TripsFilter } from '@/components/trips-filter'
import { TripCard } from '@/components/trip-card'
import { Card, CardContent } from '@/components/ui/card'

const DIRECTIONS = [
  { code: 'VK', label: 'Virtsu → Kuivastu' },
  { code: 'KV', label: 'Kuivastu → Virtsu' },
  { code: 'RH', label: 'Rohuküla → Heltermaa' },
  { code: 'HR', label: 'Heltermaa → Rohuküla' },
] as const

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type SearchParams = Promise<Record<string, string | undefined>>

export default async function TripsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireUser()
  const params = await searchParams
  const direction = DIRECTIONS.find((d) => d.code === params.direction)?.code ?? 'HR'
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayIso()

  let trips: Awaited<ReturnType<typeof listTrips>> = []
  let error: string | null = null
  try {
    trips = await listTrips(direction, date)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Laevaliiklust ei saanud laadida'
  }

  const myExisting = trips.length
    ? await db
        .select({ tripUid: subscriptions.tripUid, capacityType: subscriptions.capacityType })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, session.user.id),
            inArray(
              subscriptions.tripUid,
              trips.map((t) => t.uid),
            ),
          ),
        )
        .all()
    : []
  const existingKey = new Set(myExisting.map((r) => `${r.tripUid}|${r.capacityType}`))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Reisid</h1>
        <p className="text-sm text-muted-foreground">
          Vali suund ja kuupäev, seejärel telli teavitus väljumise kohta.
        </p>
      </div>

      <TripsFilter directions={DIRECTIONS} currentDirection={direction} currentDate={date} />

      {error ? (
        <Card>
          <CardContent className="py-6 text-destructive">{error}</CardContent>
        </Card>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            Sellel kuupäeval reise ei leitud.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.uid}
              trip={trip}
              direction={direction}
              date={date}
              existingKey={existingKey}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  praamidAuthState,
  tickets,
  tripOptions,
  trips,
  user,
  type PraamidAuthStatus,
  type Ticket,
} from '@/db/schema'
import { requireAdmin, requireUser } from '@/lib/session'
import { getAllSettings } from '@/lib/settings'

export type TripCardData = {
  trip: {
    id: string
    direction: string
    measurementUnit: string
    notify: boolean
    edit: boolean
    lastCheckedAt: Date | null
    swapInProgress: boolean
  }
  options: Array<{
    id: string
    tripId: string
    priority: number
    eventUid: string
    eventDate: string
    eventDtstart: Date
    stopBeforeAt: Date
    lastCapacity: number | null
    lastCapacityState: string | null
    lastCapacityCheckedAt: Date | null
  }>
  ticket: Ticket | null
}

export async function getMyTripCards(): Promise<TripCardData[]> {
  const session = await requireUser()
  const userId = session.user.id

  const [myTrips, myOptions, myTickets] = await Promise.all([
    db.select().from(trips).where(eq(trips.userId, userId)),
    db.select().from(tripOptions).where(eq(tripOptions.userId, userId)),
    db.select().from(tickets).where(eq(tickets.userId, userId)),
  ])

  const optionsByTrip = new Map<string, typeof myOptions>()
  for (const o of myOptions) {
    const list = optionsByTrip.get(o.tripId) ?? []
    list.push(o)
    optionsByTrip.set(o.tripId, list)
  }
  const ticketByTrip = new Map(myTickets.map((t) => [t.tripId, t]))

  return myTrips
    .map<TripCardData>((trip) => {
      const opts = (optionsByTrip.get(trip.id) ?? []).sort(
        (a, b) => a.priority - b.priority,
      )
      return {
        trip: {
          id: trip.id,
          direction: trip.direction,
          measurementUnit: trip.measurementUnit,
          notify: trip.notify,
          edit: trip.edit,
          lastCheckedAt: trip.lastCheckedAt,
          swapInProgress: trip.swapInProgress,
        },
        options: opts.map((o) => ({
          id: o.id,
          tripId: o.tripId,
          priority: o.priority,
          eventUid: o.eventUid,
          eventDate: o.eventDate,
          eventDtstart: o.eventDtstart,
          stopBeforeAt: o.stopBeforeAt,
          lastCapacity: o.lastCapacity,
          lastCapacityState: o.lastCapacityState,
          lastCapacityCheckedAt: o.lastCapacityCheckedAt,
        })),
        ticket: ticketByTrip.get(trip.id) ?? null,
      }
    })
    .sort((a, b) => {
      const aNext = a.options[0]?.eventDtstart.getTime() ?? Infinity
      const bNext = b.options[0]?.eventDtstart.getTime() ?? Infinity
      return aNext - bNext
    })
}

export type PraamidAuthStateView = {
  status: PraamidAuthStatus
  lastError: string | null
}

export async function getMyPraamidAuthState(): Promise<PraamidAuthStateView> {
  const session = await requireUser()
  const [row] = await db
    .select({ status: praamidAuthState.status, lastError: praamidAuthState.lastError })
    .from(praamidAuthState)
    .where(eq(praamidAuthState.userId, session.user.id))
    .limit(1)
  return {
    status: (row?.status as PraamidAuthStatus | undefined) ?? 'unauthenticated',
    lastError: row?.lastError ?? null,
  }
}

export type AdminUserRow = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  createdAt: Date
  subCount: number
}

export type AdminTripRow = {
  id: string
  userEmail: string
  direction: string
  measurementUnit: string
  eventUid: string
  eventDate: string
  eventDtstart: Date
  lastCapacity: number | null
}

export type AdminDashboardData = {
  pollIntervalMs: number
  editGloballyEnabled: boolean
  users: AdminUserRow[]
  trips: AdminTripRow[]
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  await requireAdmin()

  const [users, allTrips, allOptions, settings] = await Promise.all([
    db.select().from(user),
    db.select().from(trips),
    db.select().from(tripOptions),
    getAllSettings(),
  ])

  const tripCountByUser = new Map<string, number>()
  for (const t of allTrips) {
    tripCountByUser.set(t.userId, (tripCountByUser.get(t.userId) ?? 0) + 1)
  }

  const userRows: AdminUserRow[] = [...users]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? 'user',
      banned: u.banned ?? false,
      createdAt: u.createdAt,
      subCount: tripCountByUser.get(u.id) ?? 0,
    }))

  const emailById = new Map(users.map((u) => [u.id, u.email]))

  const firstOptionByTrip = new Map<string, (typeof allOptions)[number]>()
  for (const o of [...allOptions].sort((a, b) => a.priority - b.priority)) {
    if (!firstOptionByTrip.has(o.tripId)) firstOptionByTrip.set(o.tripId, o)
  }

  const tripRows: AdminTripRow[] = allTrips
    .map((t) => {
      const opt = firstOptionByTrip.get(t.id)
      if (!opt) return null
      return {
        id: t.id,
        userEmail: emailById.get(t.userId) ?? '—',
        direction: t.direction,
        measurementUnit: t.measurementUnit,
        eventUid: opt.eventUid,
        eventDate: opt.eventDate,
        eventDtstart: opt.eventDtstart,
        lastCapacity: opt.lastCapacity,
      }
    })
    .filter((r): r is AdminTripRow => r !== null)
    .sort((a, b) => b.eventDtstart.getTime() - a.eventDtstart.getTime())

  return {
    pollIntervalMs: settings.pollIntervalMs,
    editGloballyEnabled: settings.editGloballyEnabled,
    users: userRows,
    trips: tripRows,
  }
}

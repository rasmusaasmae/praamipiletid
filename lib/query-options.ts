import { queryOptions } from '@tanstack/react-query'
import type { PraamidAuthStatus, Ticket } from '@/db/schema'
import { getAdminDashboard, getMyPraamidAuthState, getMyTripCards } from './queries'

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

export type PraamidAuthStateView = {
  status: PraamidAuthStatus
  lastError: string | null
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

export const tripsQueryOptions = queryOptions({
  queryKey: ['trips'],
  queryFn: () => getMyTripCards(),
})

export const praamidAuthStateQueryOptions = queryOptions({
  queryKey: ['praamidAuthState'],
  queryFn: () => getMyPraamidAuthState(),
})

export const adminDashboardQueryOptions = queryOptions({
  queryKey: ['adminDashboard'],
  queryFn: () => getAdminDashboard(),
})

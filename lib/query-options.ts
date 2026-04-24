import { queryOptions } from '@tanstack/react-query'
import type { PraamidAuthStatus } from '@/db/schema'
import { getAdminDashboard, getMyPraamidAuthState, getMyTicketCards } from './queries'

export type TicketCardData = {
  ticket: {
    userId: string
    bookingUid: string
    ticketId: number
    ticketCode: string
    ticketNumber: string
    direction: string
    measurementUnit: string
    eventUid: string
    eventDtstart: Date
    ticketDate: string
    swapInProgress: boolean
    capturedAt: Date
  }
  options: Array<{
    id: string
    bookingUid: string
    priority: number
    eventUid: string
    eventDate: string
    eventDtstart: Date
    stopBeforeMinutes: number
  }>
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

export type AdminTicketRow = {
  userId: string
  userEmail: string
  bookingUid: string
  ticketCode: string
  direction: string
  measurementUnit: string
  eventUid: string
  eventDtstart: Date
  optionsCount: number
}

export type AdminDashboardData = {
  users: AdminUserRow[]
  tickets: AdminTicketRow[]
}

export const ticketsQueryOptions = queryOptions({
  queryKey: ['tickets'],
  queryFn: () => getMyTicketCards(),
})

export const praamidAuthStateQueryOptions = queryOptions({
  queryKey: ['praamidAuthState'],
  queryFn: () => getMyPraamidAuthState(),
})

export const adminDashboardQueryOptions = queryOptions({
  queryKey: ['adminDashboard'],
  queryFn: () => getAdminDashboard(),
})

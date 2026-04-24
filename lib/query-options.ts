import { queryOptions } from '@tanstack/react-query'
import type { PraamidAuthStatus } from '@/db/schema'
import { getMyPraamidAuthState, getMyTicketCards } from './queries'

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

export const ticketsQueryOptions = queryOptions({
  queryKey: ['tickets'],
  queryFn: () => getMyTicketCards(),
})

export const praamidAuthStateQueryOptions = queryOptions({
  queryKey: ['praamidAuthState'],
  queryFn: () => getMyPraamidAuthState(),
})

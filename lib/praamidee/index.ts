import 'server-only'
import { listCredentialedUserIds } from './auth/credentials'
import { capacityUnit } from './capacity-unit'
import { direction } from './direction'
import { event } from './event'
import { createUserScope } from './user'

export const praamidee = {
  event,
  direction,
  capacityUnit,
  user: createUserScope,
  listAuthedUserIds: listCredentialedUserIds,
}

export { PraamidAuthError } from './errors'
export type {
  AuthInfo,
  Booking,
  BookingBalance,
  BookingCustomer,
  BookingExpiration,
  Capacities,
  CapacityUnit,
  CodeName,
  CommitZeroSumResult,
  Direction,
  EditTicketBody,
  PraamidAuthStatus,
  PraamidEvent,
  Ticket,
  TicketDirection,
  TicketEvent,
  TicketStatus,
} from './types'
export { PRAAMID_AUTH_STATUSES } from './types'
export type { UserScope } from './user'

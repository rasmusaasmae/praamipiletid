import 'server-only'
import * as authOps from './ops/auth'
import * as bookingOps from './ops/booking'
import * as ticketOps from './ops/ticket'
import type { EditTicketBody } from './types'

export function createUserScope(userId: string) {
  return {
    ticket: {
      list: () => ticketOps.listTickets(userId),
      edit: (ticketCode: string, body: EditTicketBody) =>
        ticketOps.editTicket(userId, ticketCode, body),
    },
    booking: {
      get: (bookingUid: string) => bookingOps.getBooking(userId, bookingUid),
      balance: (bookingUid: string) => bookingOps.getBookingBalance(userId, bookingUid),
      expiration: (bookingUid: string) => bookingOps.getBookingExpiration(userId, bookingUid),
      commitZeroSum: (bookingUid: string) => bookingOps.commitZeroSum(userId, bookingUid),
    },
    auth: {
      get: () => authOps.getAuthInfo(userId),
      startLogin: (isikukood: string) => authOps.startLogin(userId, isikukood),
      cancelLogin: () => authOps.cancelLogin(userId),
      forget: () => authOps.forget(userId),
    },
  }
}

export type UserScope = ReturnType<typeof createUserScope>

import type {
  Booking,
  BookingBalance,
  CommitZeroSumResult,
  EditTicketBody,
  PraamidEvent,
  Ticket,
} from './types'

// Everything the app needs from praamid.ee. The real implementation talks to
// the site; tests use the in-memory fake from `@ferry-tickets/praamidee/fake`.
export interface Praamid {
  // Departures in one direction on one date (YYYY-MM-DD), with live capacity.
  events(direction: string, date: string): Promise<PraamidEvent[]>
  // Users holding a praamid.ee login that has not expired.
  loggedInUserIds(): Promise<string[]>
  user(userId: string): PraamidUser
}

export interface PraamidUser {
  // When the stored praamid.ee login stops working; null without a login.
  loginExpiresAt(): Promise<Date | null>
  tickets(): Promise<Ticket[]>
  booking(bookingUid: string): Promise<Booking>
  // Moves a ticket to the departure in `body`. Stays a draft until committed.
  editTicket(ticketCode: string, body: EditTicketBody): Promise<void>
  balance(bookingUid: string): Promise<BookingBalance>
  commitZeroSum(bookingUid: string): Promise<CommitZeroSumResult>
}

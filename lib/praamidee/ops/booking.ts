import 'server-only'
import { authedFetch, authedRequest } from '../client'
import { PraamidAuthError } from '../errors'
import type { Booking, BookingBalance, BookingExpiration, CommitZeroSumResult } from '../types'

export async function getBooking(userId: string, bookingUid: string): Promise<Booking> {
  return authedFetch<Booking>(userId, `/bookings/${encodeURIComponent(bookingUid)}`)
}

export async function getBookingBalance(
  userId: string,
  bookingUid: string,
): Promise<BookingBalance> {
  return authedFetch<BookingBalance>(userId, `/bookings/${encodeURIComponent(bookingUid)}/balance`)
}

export async function getBookingExpiration(
  userId: string,
  bookingUid: string,
): Promise<BookingExpiration> {
  return authedFetch<BookingExpiration>(
    userId,
    `/bookings/${encodeURIComponent(bookingUid)}/expiration`,
  )
}

export async function commitZeroSum(
  userId: string,
  bookingUid: string,
): Promise<CommitZeroSumResult> {
  const res = await authedRequest(userId, `/bookings/${encodeURIComponent(bookingUid)}/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ zeroSum: true }),
  })
  if (res.status !== 201) {
    throw new PraamidAuthError(
      res.status,
      `POST /online/bookings/${bookingUid}/invoices`,
      `expected 201, got ${res.status}`,
    )
  }
  const location = res.headers.get('location')
  const match = location?.match(/\/invoices\/([^/?#]+)\/?$/)
  if (!match) {
    throw new PraamidAuthError(
      res.status,
      `POST /online/bookings/${bookingUid}/invoices`,
      `missing invoice number in Location header: ${location ?? '(none)'}`,
    )
  }
  return { invoiceNumber: decodeURIComponent(match[1]!) }
}

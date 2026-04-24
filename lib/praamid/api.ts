import 'server-only'
import type {
  Booking,
  BookingBalance,
  BookingExpiration,
  CapacityUnit,
  CommitZeroSumResult,
  Direction,
  EditTicketBody,
  PraamidEvent,
  Ticket,
  Userinfo,
} from './types'

const BASE_URL = 'https://www.praamid.ee/online'
const LOGIN_BASE_URL = 'https://www.praamid.ee/login'

type ApiList<T> = { totalCount: number; items: T[] }

export class PraamidAuthError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodySnippet: string,
  ) {
    super(`Praamid ${status} ${url}: ${bodySnippet}`)
    this.name = 'PraamidAuthError'
  }
}

// Public (unauthenticated) endpoints --------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Praamid API ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

export async function listDirections(): Promise<Direction[]> {
  const data = await fetchJson<ApiList<Direction>>(`${BASE_URL}/directions`)
  return data.items
}

export async function listCapacityUnits(): Promise<CapacityUnit[]> {
  const data = await fetchJson<ApiList<CapacityUnit>>(
    `${BASE_URL}/capacity-units?type=all&items=true&include=MV`,
  )
  return data.items
}

export async function listEvents(
  direction: string,
  date: string,
  timeShift = 300,
): Promise<PraamidEvent[]> {
  const url = `${BASE_URL}/events?direction=${encodeURIComponent(direction)}&departure-date=${encodeURIComponent(date)}&time-shift=${timeShift}`
  const data = await fetchJson<ApiList<PraamidEvent>>(url)
  return data.items
}

// Authenticated endpoints --------------------------------------------------

async function authedRequest(
  path: string,
  token: string,
  init: RequestInit = {},
  base: string = BASE_URL,
): Promise<Response> {
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new PraamidAuthError(res.status, url, body.slice(0, 200))
  }
  return res
}

async function authedFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  base: string = BASE_URL,
): Promise<T> {
  const res = await authedRequest(path, token, init, base)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function getUserinfo(token: string): Promise<Userinfo> {
  return authedFetch<Userinfo>('/api/v1/userinfo', token, {}, LOGIN_BASE_URL)
}

export async function listTickets(token: string): Promise<Ticket[]> {
  const data = await authedFetch<ApiList<Ticket>>('/tickets', token)
  return data.items
}

export async function getBooking(token: string, bookingUid: string): Promise<Booking> {
  return authedFetch<Booking>(`/bookings/${encodeURIComponent(bookingUid)}`, token)
}

export async function getBookingBalance(
  token: string,
  bookingUid: string,
): Promise<BookingBalance> {
  return authedFetch<BookingBalance>(`/bookings/${encodeURIComponent(bookingUid)}/balance`, token)
}

export async function getBookingExpiration(
  token: string,
  bookingUid: string,
): Promise<BookingExpiration> {
  return authedFetch<BookingExpiration>(
    `/bookings/${encodeURIComponent(bookingUid)}/expiration`,
    token,
  )
}

export async function editTicket(
  token: string,
  oldTicketCode: string,
  body: EditTicketBody,
): Promise<void> {
  const res = await authedRequest(`/tickets/${encodeURIComponent(oldTicketCode)}`, token, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status !== 204) {
    throw new PraamidAuthError(
      res.status,
      `PUT /online/tickets/${oldTicketCode}`,
      `expected 204, got ${res.status}`,
    )
  }
}

export async function commitZeroSum(
  token: string,
  bookingUid: string,
): Promise<CommitZeroSumResult> {
  const res = await authedRequest(`/bookings/${encodeURIComponent(bookingUid)}/invoices`, token, {
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

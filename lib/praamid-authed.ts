import 'server-only'

const BASE_URL = 'https://www.praamid.ee/online'
const LOGIN_BASE_URL = 'https://www.praamid.ee/login'

export type LocalizedName = {
  default?: string
  en?: string
  et?: string
  ru?: string
}

export type CodeName = {
  code: string
  name?: string
  names?: LocalizedName
}

export type TicketStatus = {
  code:
    | 'DRAFT'
    | 'ACTIVE'
    | 'BEING_EDITED'
    | 'CANCELLED'
    | 'EXPIRED'
    | (string & {})
  names: LocalizedName
}

export type TicketEvent = {
  uid: string
  dtstart: string
  dtend: string
  transportationType: CodeName
  ship: CodeName
}

export type TicketDirection = CodeName & {
  fromPort: CodeName
  toPort: CodeName
  tripLine?: string
  validFrom?: string
}

export type MeasurementUnit = {
  code: string
  name?: string
  names?: LocalizedName
}

export type CapacityUnitRef = CodeName & {
  type?: CodeName
  measurementUnit?: MeasurementUnit
  vehicle?: boolean
  trailer?: boolean
  useAsVehicleInCp?: boolean
}

export type BoardingPass = {
  id: number
  item: CodeName
  itemPrice: number
  amount: number
  capacityUnit: CapacityUnitRef
  priceCategory?: CodeName
  quantity: number
  decimalQuantity?: number
  dci: 'C' | 'D' | (string & {})
  personCodes?: string[]
  vehicleRegNr?: string | null
  exceedingWidth?: boolean
  exceedingHeight?: boolean
  exceedingWeight?: boolean
  fellowPassenger?: boolean
  vat?: CodeName
}

export type TicketInvoiceRef = {
  invoiceNr: string
  type: CodeName
}

export type BookingCustomer = {
  code: string
  name: string
  email: string
  language?: string
  dangerousCargoAllowed?: boolean
  disability?: boolean
  warRefugeeTicketAllowed?: boolean
}

export type Ticket = {
  id: number
  bookingUid: string
  bookingReferenceNumber: string
  sequenceNumber: number
  ticketNumber: string
  ticketCode: string
  ticketDate: string
  bookingDate: string
  draftExpiresAt?: string
  draftExpirationExtensionCount?: number
  customer: BookingCustomer
  event: TicketEvent
  direction: TicketDirection
  pricelist: CodeName
  totalAmount: number
  currency: string
  invoices: TicketInvoiceRef[]
  paymentNumber?: string
  phoneNumber?: string
  needsAttention?: boolean
  dangerous?: boolean
  emergency?: boolean
  status: TicketStatus
  smsNotification?: boolean
  smsDepartureNotification?: boolean
  calendarInvite?: boolean
  manualActivation?: boolean
  pos?: CodeName
  boardingPasses: BoardingPass[]
  services?: unknown[]
  qrcode?: string
  offline?: boolean
  creatorUid?: string
  creatorName?: string
  attachments?: unknown[]
  invoiceNumber?: string
  hasParentTicket: boolean
  parentTicketId?: number | null
  sysModifyTime?: string
}

export type Booking = {
  uid: string
  referenceNumber: string
  customer: BookingCustomer
  tickets: Ticket[]
}

export type BookingBalance = {
  totalAmount: number
  unpaidAmount: number
  unbilledAmount: number
}

export type BookingExpiration = {
  expiresIn: number
}

export type Userinfo = {
  sub: string
  email_verified?: boolean
  preferred_username?: string
  given_name?: string
  family_name?: string
  email?: string
  [key: string]: unknown
}

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
  return authedFetch<BookingBalance>(
    `/bookings/${encodeURIComponent(bookingUid)}/balance`,
    token,
  )
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

// Patched ticket body for editTicket — caller starts from a Ticket and
// swaps event fields (uid, dtstart, dtend, ship, pricelist,
// transportationType, capacities, status, highPrice). The runtime object
// carries extra upstream fields (services, qrcode, vehicleDimensions, …)
// not modelled in our Ticket type — JSON.stringify preserves them.
export type EditTicketBody = Ticket

export async function editTicket(
  token: string,
  oldTicketCode: string,
  body: EditTicketBody,
): Promise<void> {
  const res = await authedRequest(
    `/tickets/${encodeURIComponent(oldTicketCode)}`,
    token,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (res.status !== 204) {
    throw new PraamidAuthError(
      res.status,
      `PUT /online/tickets/${oldTicketCode}`,
      `expected 204, got ${res.status}`,
    )
  }
}

export type CommitZeroSumResult = { invoiceNumber: string }

export async function commitZeroSum(
  token: string,
  bookingUid: string,
): Promise<CommitZeroSumResult> {
  const res = await authedRequest(
    `/bookings/${encodeURIComponent(bookingUid)}/invoices`,
    token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zeroSum: true }),
    },
  )
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

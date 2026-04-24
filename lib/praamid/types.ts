// Wire types for the praamid.ee API. Mirrors the JSON the upstream returns;
// kept narrow enough to typecheck the call sites we use, not exhaustive.

// Public catalog types ------------------------------------------------------

export type Direction = {
  code: string
  name: string
  fromPort: { code: string; name: string }
  toPort: { code: string; name: string }
  reverseDirection: { code: string }
}

export type CapacityUnit = {
  code: string
  name: string
  type: { code: string }
  measurementUnit: { code: string; name: string }
  vehicle: boolean
  trailer: boolean
}

export type Capacities = {
  pcs?: number
  bc?: number
  sv?: number
  bv?: number
  mc?: number
  dc?: number
  inv?: number
  [key: string]: number | undefined
}

export type PraamidEvent = {
  uid: string
  dtstart: string
  dtend: string
  status: string
  capacities: Capacities
  ship: { code: string }
  transportationType: { code: string }
  pricelist?: { code: string }
  highPrice?: boolean
  isNextDay?: boolean
}

// Authenticated booking/ticket types ---------------------------------------

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
  code: 'DRAFT' | 'ACTIVE' | 'BEING_EDITED' | 'CANCELLED' | 'EXPIRED' | (string & {})
  names: LocalizedName
}

export type TicketEvent = {
  uid: string
  dtstart: string
  dtend: string
  transportationType: CodeName
  ship: CodeName
  pricelist?: CodeName
  status?: string
  highPrice?: boolean
  isNextDay?: boolean
  capacities?: Record<string, number | undefined>
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

// Patched ticket body for editTicket — caller starts from a Ticket and
// swaps event fields (uid, dtstart, dtend, ship, pricelist,
// transportationType, capacities, status, highPrice). The runtime object
// carries extra upstream fields (services, qrcode, vehicleDimensions, …)
// not modelled here — JSON.stringify preserves them.
export type EditTicketBody = Ticket

export type CommitZeroSumResult = { invoiceNumber: string }

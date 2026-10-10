import { PraamidAuthError } from './errors'
import type { Praamid, PraamidUser } from './port'
import type { Booking, Capacities, EditTicketBody, PraamidEvent, Ticket } from './types'

// In-memory praamid.ee for tests. Models the parts the app relies on:
// departures with capacity and price, tickets in bookings, and the
// edit → balance → commit sequence of a ticket change, where an edit stays a
// draft until committed and a commit fails while anything is owed.

export type FakeDeparture = {
  uid: string
  direction: string
  date: string // YYYY-MM-DD, local to the route
  dtstart: string // ISO
  ship?: string
  free?: Capacities
  price?: number
}

type Operation = keyof PraamidUser | 'events'

type Hold = { promise: Promise<void>; release: () => void }

export function createFakePraamid() {
  const departures = new Map<string, Required<FakeDeparture>>()
  const tickets: { userId: string; ticket: Ticket }[] = []
  const logins = new Map<string, Date>()
  // ticketCode → departure uid the ticket was moved to, not yet committed.
  const drafts = new Map<string, string>()
  const failures = new Map<Operation, number>()
  const holds = new Map<Operation, Hold>()
  let nextId = 1000

  async function enter(op: Operation): Promise<void> {
    const hold = holds.get(op)
    if (hold) {
      holds.delete(op)
      await hold.promise
    }
    const left = failures.get(op) ?? 0
    if (left > 0) {
      failures.set(op, left - 1)
      throw new PraamidAuthError(500, `fake://${op}`, 'injected failure')
    }
  }

  function departure(uid: string): Required<FakeDeparture> {
    const d = departures.get(uid)
    if (!d) throw new Error(`fake praamid: unknown departure ${uid}`)
    return d
  }

  function toEvent(d: Required<FakeDeparture>): PraamidEvent {
    return {
      uid: d.uid,
      dtstart: d.dtstart,
      dtend: new Date(Date.parse(d.dtstart) + 30 * 60_000).toISOString(),
      status: 'OPEN',
      capacities: { ...d.free },
      ship: { code: d.ship },
      transportationType: { code: 'FERRY' },
    }
  }

  function ticketEvent(d: Required<FakeDeparture>): Ticket['event'] {
    const e = toEvent(d)
    return { ...e, ship: { code: d.ship }, transportationType: { code: 'FERRY' } }
  }

  function owned(userId: string, predicate: (t: Ticket) => boolean): Ticket {
    const entry = tickets.find((e) => e.userId === userId && predicate(e.ticket))
    if (!entry) throw new PraamidAuthError(404, 'fake://ticket', 'not found')
    return entry.ticket
  }

  function unitOf(t: Ticket): string {
    return t.boardingPasses[0]?.capacityUnit.measurementUnit?.code ?? 'sv'
  }

  function user(userId: string): PraamidUser {
    async function authed(op: Operation) {
      if (!logins.has(userId)) throw new PraamidAuthError(401, `fake://${op}`, 'no_credential')
      await enter(op)
    }

    function balanceOf(bookingUid: string) {
      let unpaid = 0
      for (const { ticket } of tickets) {
        if (ticket.bookingUid !== bookingUid) continue
        const draft = drafts.get(ticket.ticketCode)
        if (draft) unpaid += Math.max(0, departure(draft).price - ticket.totalAmount)
      }
      return unpaid
    }

    return {
      async loginExpiresAt() {
        return logins.get(userId) ?? null
      },

      async tickets() {
        await authed('tickets')
        return tickets.filter((e) => e.userId === userId).map((e) => structuredClone(e.ticket))
      },

      async booking(bookingUid): Promise<Booking> {
        await authed('booking')
        const own = tickets.filter((e) => e.userId === userId && e.ticket.bookingUid === bookingUid)
        if (own.length === 0) throw new PraamidAuthError(404, 'fake://booking', 'not found')
        return {
          uid: bookingUid,
          referenceNumber: own[0]!.ticket.bookingReferenceNumber,
          customer: own[0]!.ticket.customer,
          tickets: own.map((e) => structuredClone(e.ticket)),
        }
      },

      async editTicket(ticketCode, body: EditTicketBody) {
        await authed('editTicket')
        const t = owned(userId, (x) => x.ticketCode === ticketCode && x.status.code === 'ACTIVE')
        if (body.event.uid === t.event.uid) {
          drafts.delete(ticketCode)
          return
        }
        const target = departure(body.event.uid)
        if ((target.free[unitOf(t)] ?? 0) < 1) {
          throw new PraamidAuthError(409, 'fake://editTicket', 'departure is full')
        }
        drafts.set(ticketCode, target.uid)
      },

      async balance(bookingUid) {
        await authed('balance')
        const unpaid = balanceOf(bookingUid)
        return { totalAmount: 0, unpaidAmount: unpaid, unbilledAmount: unpaid }
      },

      async commitZeroSum(bookingUid) {
        await authed('commitZeroSum')
        if (balanceOf(bookingUid) > 0) {
          throw new PraamidAuthError(409, 'fake://commit', 'booking has an unpaid amount')
        }
        for (const [ticketCode, uid] of drafts) {
          const old = tickets.find((e) => e.ticket.ticketCode === ticketCode)
          if (!old || old.ticket.bookingUid !== bookingUid) continue
          drafts.delete(ticketCode)
          const unit = unitOf(old.ticket)
          const from = departure(old.ticket.event.uid)
          const to = departure(uid)
          from.free[unit] = (from.free[unit] ?? 0) + 1
          to.free[unit] = (to.free[unit] ?? 0) - 1
          old.ticket.status = { code: 'CANCELLED', names: {} }
          const id = nextId++
          tickets.push({
            userId: old.userId,
            ticket: {
              ...structuredClone(old.ticket),
              id,
              ticketCode: `TC-${id}`,
              ticketNumber: `T-${id}`,
              event: ticketEvent(to),
              status: { code: 'ACTIVE', names: {} },
              hasParentTicket: true,
              parentTicketId: old.ticket.id,
            },
          })
        }
        return { invoiceNumber: `INV-${nextId++}` }
      },
    }
  }

  const praamid: Praamid = {
    async events(direction, date) {
      await enter('events')
      return [...departures.values()]
        .filter((d) => d.direction === direction && d.date === date)
        .map(toEvent)
    },
    async loggedInUserIds() {
      return [...logins.keys()]
    },
    user,
  }

  return {
    praamid,

    // Setup ------------------------------------------------------------------

    addDeparture(d: FakeDeparture): void {
      departures.set(d.uid, { ship: 'RE', free: {}, price: 0, ...d })
    },

    setFree(uid: string, free: Capacities): void {
      departure(uid).free = { ...free }
    },

    setPrice(uid: string, price: number): void {
      departure(uid).price = price
    },

    login(userId: string, expiresAt: Date): void {
      logins.set(userId, expiresAt)
    },

    // Books `userId` onto a departure, paying its current price.
    book(userId: string, departureUid: string, opts: { unit?: string } = {}): Ticket {
      const d = departure(departureUid)
      const id = nextId++
      const ticket: Ticket = {
        id,
        bookingUid: `B-${id}`,
        bookingReferenceNumber: `R-${id}`,
        sequenceNumber: 1,
        ticketNumber: `T-${id}`,
        ticketCode: `TC-${id}`,
        ticketDate: d.date,
        bookingDate: d.date,
        customer: { code: userId, name: userId, email: `${userId}@example.com` },
        event: ticketEvent(d),
        direction: {
          code: d.direction,
          fromPort: { code: d.direction[0]! },
          toPort: { code: d.direction[1]! },
        },
        pricelist: { code: 'STANDARD' },
        totalAmount: d.price,
        currency: 'EUR',
        invoices: [],
        status: { code: 'ACTIVE', names: {} },
        boardingPasses: [
          {
            id,
            item: { code: 'VEHICLE' },
            itemPrice: d.price,
            amount: d.price,
            capacityUnit: { code: 'SV', measurementUnit: { code: opts.unit ?? 'sv' } },
            quantity: 1,
            dci: 'D',
          },
        ],
        hasParentTicket: false,
        parentTicketId: null,
      }
      tickets.push({ userId, ticket })
      return structuredClone(ticket)
    },

    // Removes a ticket as if the user cancelled it on praamid.ee.
    cancel(ticketId: number): void {
      const entry = tickets.find((e) => e.ticket.id === ticketId)
      if (entry) entry.ticket.status = { code: 'CANCELLED', names: {} }
    },

    // Reschedules a departure in place, as praamid.ee sometimes does.
    reschedule(uid: string, dtstart: string): void {
      departure(uid).dtstart = dtstart
      for (const { ticket } of tickets) {
        if (ticket.event.uid === uid) ticket.event = ticketEvent(departure(uid))
      }
    },

    // Makes the next `times` calls of `op` fail.
    fail(op: Operation, times = 1): void {
      failures.set(op, times)
    },

    // Makes the next call of `op` wait until released.
    hold(op: Operation): { release: () => void } {
      let release!: () => void
      const promise = new Promise<void>((r) => (release = r))
      holds.set(op, { promise, release })
      return { release }
    },

    // Inspection -------------------------------------------------------------

    // The user's active tickets, as praamid.ee sees them.
    activeTickets(userId: string): Ticket[] {
      return tickets
        .filter((e) => e.userId === userId && e.ticket.status.code === 'ACTIVE')
        .map((e) => structuredClone(e.ticket))
    },

    // Tickets with an uncommitted edit.
    pendingEdits(): string[] {
      return [...drafts.keys()]
    },
  }
}

export type FakePraamid = ReturnType<typeof createFakePraamid>

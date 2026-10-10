import { DBOS } from '@dbos-inc/dbos-sdk'
import type { PraamidEvent, Ticket as PraamidTicket } from '@praamipiletid/praamidee'

import { deps } from './deps'
import { syncUser } from './sync'

export type SwapInput = {
  userId: string
  ticketCode: string
  bookingUid: string
  target: PraamidEvent
  now: string
}

export type SwapOutcome =
  | { kind: 'swapped' }
  | { kind: 'ticket_inactive' }
  | { kind: 'would_cost'; unpaid: number }

// Moves one ticket to `target` on praamid.ee. Durable: after a crash DBOS
// resumes it from the last finished step, so a committed change is never
// made twice and never left unsynced.
async function swap(input: SwapInput): Promise<SwapOutcome> {
  const { db, praamid } = deps()
  const user = praamid.user(input.userId)

  const booking = await DBOS.runStep(() => user.booking(input.bookingUid), { name: 'getBooking' })
  const current = booking.tickets.find((t) => t.ticketCode === input.ticketCode)
  if (current?.status.code !== 'ACTIVE') return { kind: 'ticket_inactive' }

  await DBOS.runStep(() => user.editTicket(input.ticketCode, moveTo(current, input.target)), {
    name: 'editTicket',
  })
  // Never pay: anything owed means the change is undone before committing.
  const { unpaidAmount } = await DBOS.runStep(() => user.balance(input.bookingUid), {
    name: 'balance',
  })
  if (unpaidAmount > 0) {
    await DBOS.runStep(() => user.editTicket(input.ticketCode, current), { name: 'revert' })
    return { kind: 'would_cost', unpaid: unpaidAmount }
  }

  await DBOS.runStep(() => user.commitZeroSum(input.bookingUid), { name: 'commit' })
  await DBOS.runStep(() => syncUser(db, praamid, input.userId, new Date(input.now)), {
    name: 'sync',
  })
  return { kind: 'swapped' }
}

export const swapWorkflow = DBOS.registerWorkflow(swap, { name: 'swap' })

// The ticket as praamid.ee expects it back, with its departure replaced.
function moveTo(ticket: PraamidTicket, event: PraamidEvent): PraamidTicket {
  return {
    ...ticket,
    event: {
      ...ticket.event,
      uid: event.uid,
      dtstart: event.dtstart,
      dtend: event.dtend,
      ship: { ...ticket.event.ship, code: event.ship.code },
      transportationType: {
        ...ticket.event.transportationType,
        code: event.transportationType.code,
      },
      capacities: event.capacities,
      status: event.status,
      ...(event.highPrice !== undefined ? { highPrice: event.highPrice } : {}),
      ...(event.pricelist
        ? { pricelist: { ...ticket.event.pricelist, code: event.pricelist.code } }
        : {}),
    },
  }
}

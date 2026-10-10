import { DBOS } from '@dbos-inc/dbos-sdk'
import { tickets, user as users, type Db } from '@praamipiletid/db'
import type { PraamidEvent, Ticket as PraamidTicket } from '@praamipiletid/praamidee'
import { eq } from 'drizzle-orm'

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
  | { kind: 'failed' }

// Moves one ticket to `target` on praamid.ee. Durable: after a crash DBOS
// resumes it from the last finished step, so a committed change is never
// made twice and never left unsynced.
async function swap(input: SwapInput): Promise<SwapOutcome> {
  const { db, praamid, mailer } = deps()
  const user = praamid.user(input.userId)

  const booking = await DBOS.runStep(() => user.booking(input.bookingUid), { name: 'getBooking' })
  const current = booking.tickets.find((t) => t.ticketCode === input.ticketCode)
  if (current?.status.code !== 'ACTIVE') return { kind: 'ticket_inactive' }

  await DBOS.runStep(() => user.editTicket(input.ticketCode, moveTo(current, input.target)), {
    name: 'editTicket',
  })
  // Undoes the edit, so the ticket is never left half-changed on praamid.ee.
  const revert = () =>
    DBOS.runStep(() => user.editTicket(input.ticketCode, current), { name: 'revert' })

  // Never pay: anything owed, or not knowing, means the change is undone.
  const balance = await DBOS.runStep(() => user.balance(input.bookingUid), {
    name: 'balance',
  }).catch(() => null)
  if (!balance || balance.unpaidAmount > 0) {
    await revert()
    return balance ? { kind: 'would_cost', unpaid: balance.unpaidAmount } : { kind: 'failed' }
  }

  const commit = await DBOS.runStep(() => user.commitZeroSum(input.bookingUid), {
    name: 'commit',
  }).catch(() => null)
  if (!commit) {
    await revert()
    return { kind: 'failed' }
  }
  await DBOS.runStep(() => syncUser(db, praamid, input.userId, new Date(input.now)), {
    name: 'sync',
    ...RETRY,
  })
  await DBOS.runStep(
    async () =>
      mailer.send(await swapMail(db, input.userId, current, input.target, commit.invoiceNumber)),
    { name: 'email', ...RETRY },
  )
  return { kind: 'swapped' }
}

export const swapWorkflow = DBOS.registerWorkflow(swap, { name: 'swap' })

// Steps that are safe to repeat: re-syncing and re-sending are harmless.
const RETRY = { retriesAllowed: true, maxAttempts: 5, intervalSeconds: 2, backoffRate: 2 }

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Tallinn',
  hour: '2-digit',
  minute: '2-digit',
})
const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Tallinn',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

async function swapMail(
  db: Db,
  userId: string,
  from: PraamidTicket,
  to: PraamidEvent,
  invoiceNumber: string,
) {
  const [recipient] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
  if (!recipient) throw new Error(`no user ${userId}`)
  const [successor] = await db
    .select({ ticketNumber: tickets.ticketNumber })
    .from(tickets)
    .where(eq(tickets.parentTicketId, from.id))
  const start = new Date(to.dtstart)
  const departs = new Date(from.event.dtstart)
  return {
    to: recipient.email,
    subject: `Ferry moved to ${clock.format(start)}`,
    text: [
      `Your ${from.direction.code} ferry on ${day.format(start)} moved from ${clock.format(departs)} to ${clock.format(start)}.`,
      successor ? `New ticket: ${successor.ticketNumber}.` : null,
      `Invoice: ${invoiceNumber}. Nothing was charged.`,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

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

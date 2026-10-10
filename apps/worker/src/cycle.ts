import { ticketOptions, tickets, ticketSyncs, type Db, type TicketOption } from '@ferry-tickets/db'
import { logger } from '@ferry-tickets/logger'
import type { Praamid, PraamidEvent } from '@ferry-tickets/praamidee'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'

import { syncUser } from './sync'

const log = logger.child({ scope: 'cycle' })
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

// How long a user's copy of their tickets is trusted before re-fetching.
const SYNC_EVERY_MS = 5 * 60_000
// A scheduled swap holds its ticket this long; a failed one is retried after.
const SWAP_HOLD_MS = 10 * 60_000
// A swap needs this much praamid.ee login left, so it cannot lose access
// halfway and leave an uncommitted edit behind.
const LOGIN_MARGIN_MS = 15 * 60_000

export type PlannedSwap = {
  userId: string
  ticketId: number
  ticketCode: string
  bookingUid: string
  target: PraamidEvent
}

// Step 1: confirm tickets exist, for users whose copy has gone stale.
export async function syncStaleUsers(db: Db, praamid: Praamid, now: Date): Promise<void> {
  const userIds = await praamid.loggedInUserIds()
  const synced = await db.select().from(ticketSyncs)
  const syncedAt = new Map(synced.map((s) => [s.userId, s.syncedAt.getTime()]))
  for (const userId of userIds) {
    const last = syncedAt.get(userId)
    if (last !== undefined && now.getTime() - last < SYNC_EVERY_MS) continue
    try {
      await syncUser(db, praamid, userId, now)
    } catch (err) {
      log.warn({ userId, err: message(err) }, 'sync failed')
    }
  }
}

// Step 2: check availability. For each ticket, the best open option.
export async function findSwaps(db: Db, praamid: Praamid, now: Date): Promise<PlannedSwap[]> {
  const rows = await db
    .select({ ticket: tickets, option: ticketOptions })
    .from(ticketOptions)
    .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
    .where(or(isNull(tickets.nextSwapAt), lte(tickets.nextSwapAt, now)))
    .orderBy(asc(ticketOptions.eventDtstart))

  const events = await fetchEvents(
    praamid,
    rows.map((r) => ({ direction: r.ticket.direction, date: r.option.eventDate })),
  )

  await followRescheduledDepartures(
    db,
    rows.map((r) => r.option),
    events,
  )

  const byTicket = new Map<number, typeof rows>()
  for (const row of rows) byTicket.set(row.ticket.id, [...(byTicket.get(row.ticket.id) ?? []), row])

  const swaps: PlannedSwap[] = []
  for (const [, ticketRows] of byTicket) {
    const ticket = ticketRows[0]!.ticket
    const best = ticketRows
      .map((r) => r.option)
      .filter((o) => o.eventUid !== ticket.eventUid)
      .filter((o) => o.eventDtstart.getTime() - o.stopBeforeMinutes * 60_000 > now.getTime())
      .filter((o) => (events.get(o.eventUid)?.capacities[ticket.measurementUnit] ?? 0) >= 1)
      .sort((a, b) => a.priority - b.priority)[0]
    if (!best) continue
    const loginExpiresAt = await praamid.user(ticket.userId).loginExpiresAt()
    if (!loginExpiresAt || loginExpiresAt.getTime() - now.getTime() < LOGIN_MARGIN_MS) continue
    swaps.push({
      userId: ticket.userId,
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      bookingUid: ticket.bookingUid,
      target: events.get(best.eventUid)!,
    })
  }
  return swaps
}

// Step 3 (claim half): reserve the ticket so no other cycle schedules it.
export async function claim(db: Db, ticketId: number, now: Date): Promise<boolean> {
  const claimed = await db
    .update(tickets)
    .set({ nextSwapAt: new Date(now.getTime() + SWAP_HOLD_MS) })
    .where(
      and(eq(tickets.id, ticketId), or(isNull(tickets.nextSwapAt), lte(tickets.nextSwapAt, now))),
    )
    .returning({ id: tickets.id })
  return claimed.length > 0
}

// praamid.ee sometimes moves a departure in place (same uid, new time).
// Keep our copy in step so cutoffs are measured from the real time.
async function followRescheduledDepartures(
  db: Db,
  options: TicketOption[],
  events: Map<string, PraamidEvent>,
): Promise<void> {
  for (const option of options) {
    const event = events.get(option.eventUid)
    if (!event) continue
    const live = new Date(event.dtstart)
    if (Number.isNaN(live.getTime()) || live.getTime() === option.eventDtstart.getTime()) continue
    option.eventDtstart = live
    await db
      .update(ticketOptions)
      .set({ eventDtstart: live })
      .where(eq(ticketOptions.id, option.id))
  }
}

// Departures for every direction and date an option is on, one request each.
async function fetchEvents(
  praamid: Praamid,
  options: { direction: string; date: string }[],
): Promise<Map<string, PraamidEvent>> {
  const byUid = new Map<string, PraamidEvent>()
  const buckets = new Map(options.map((o) => [`${o.direction}|${o.date}`, o]))
  for (const { direction, date } of buckets.values()) {
    try {
      for (const event of await praamid.events(direction, date)) byUid.set(event.uid, event)
    } catch (err) {
      log.warn({ direction, date, err: message(err) }, 'departures unavailable')
    }
  }
  return byUid
}

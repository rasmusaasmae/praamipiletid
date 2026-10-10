import {
  notifyUserChanged,
  ticketOptions,
  tickets,
  ticketSyncs,
  type Db,
  type Tx,
} from '@ferry-tickets/db'
import type { Praamid, Ticket as PraamidTicket } from '@ferry-tickets/praamidee'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

// The unit every ticket is checked in. praamid.ee tickets carry it per
// boarding pass, but the app only books small vehicles today.
const MEASUREMENT_UNIT = 'sv'

// Fetches the user's tickets from praamid.ee and brings our copy in line:
// active future tickets are upserted, options follow a ticket to its
// successor, gone tickets are removed, and the option a ticket now sits on
// is dropped together with every worse one.
export async function syncUser(db: Db, praamid: Praamid, userId: string, now: Date) {
  const fetched = await praamid.user(userId).tickets()
  const active = fetched.filter(
    (t) => t.status.code === 'ACTIVE' && Date.parse(t.event.dtstart) > now.getTime(),
  )
  const ids = active.map((t) => t.id)

  await db.transaction(async (tx) => {
    // Serialize concurrent syncs for the same user.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)
    await upsertTickets(tx, userId, active, now)
    await moveOptionsToSuccessors(tx, active)
    await removeGoneTickets(tx, userId, ids)
    await dropReachedOptions(tx, ids)
    await tx
      .insert(ticketSyncs)
      .values({ userId, syncedAt: now })
      .onConflictDoUpdate({ target: ticketSyncs.userId, set: { syncedAt: now } })
    await notifyUserChanged(tx, userId)
  })
}

async function upsertTickets(tx: Tx, userId: string, active: PraamidTicket[], now: Date) {
  for (const t of active) {
    const values = {
      userId,
      bookingUid: t.bookingUid,
      bookingReferenceNumber: t.bookingReferenceNumber,
      sequenceNumber: t.sequenceNumber,
      ticketCode: t.ticketCode,
      ticketNumber: t.ticketNumber,
      direction: t.direction.code,
      eventUid: t.event.uid,
      eventDtstart: new Date(t.event.dtstart),
      ticketDate: t.ticketDate,
      parentTicketId: t.parentTicketId ?? null,
      capturedAt: now,
    }
    await tx
      .insert(tickets)
      .values({ id: t.id, measurementUnit: MEASUREMENT_UNIT, ...values })
      .onConflictDoUpdate({ target: tickets.id, set: values })
  }
}

// A swap gives the ticket a new id that points back at the old one.
async function moveOptionsToSuccessors(tx: Tx, active: PraamidTicket[]) {
  for (const t of active) {
    if (t.parentTicketId == null) continue
    await tx
      .update(ticketOptions)
      .set({ ticketId: t.id })
      .where(eq(ticketOptions.ticketId, t.parentTicketId))
  }
}

async function removeGoneTickets(tx: Tx, userId: string, ids: number[]) {
  await tx
    .delete(tickets)
    .where(
      ids.length === 0
        ? eq(tickets.userId, userId)
        : and(eq(tickets.userId, userId), notInArray(tickets.id, ids)),
    )
}

async function dropReachedOptions(tx: Tx, ids: number[]) {
  if (ids.length === 0) return
  const reached = await tx
    .select({ ticketId: ticketOptions.ticketId, priority: ticketOptions.priority })
    .from(ticketOptions)
    .innerJoin(
      tickets,
      and(eq(ticketOptions.ticketId, tickets.id), eq(ticketOptions.eventUid, tickets.eventUid)),
    )
    .where(inArray(tickets.id, ids))
  for (const r of reached) {
    await tx
      .delete(ticketOptions)
      .where(
        and(
          eq(ticketOptions.ticketId, r.ticketId),
          sql`${ticketOptions.priority} >= ${r.priority}`,
        ),
      )
  }
}

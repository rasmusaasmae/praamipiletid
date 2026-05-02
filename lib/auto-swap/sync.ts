import 'server-only'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { logger } from '@/lib/logger'
import { praamidee, type Ticket as PraamidTicket, type UserScope } from '@/lib/praamidee'

const log = logger.child({ scope: 'sync-tickets' })

const DEFAULT_MEASUREMENT_UNIT = 'sv'

const lastSyncAt = new Map<string, number>()

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function maybeSyncTickets(userId: string, opts: { maxAgeMs: number }): Promise<void> {
  const last = lastSyncAt.get(userId) ?? 0
  if (Date.now() - last < opts.maxAgeMs) return
  await syncTicketsForUser(userId)
}

export async function syncTicketsForUser(userId: string): Promise<void> {
  const u = praamidee.user(userId)
  const info = await u.auth.get()
  if (info.status !== 'authenticated') return
  if (info.expiresAt && info.expiresAt.getTime() <= Date.now()) return

  const raw = await fetchUserTickets(u, userId)
  if (raw === null) return

  const active = filterActiveFuture(raw)
  const fetchedIds = active.map((t) => t.id)
  const capturedAt = new Date()

  await db.transaction(async (tx) => {
    // Serialize concurrent syncs for the same user (page-load + background).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

    await upsertActiveTickets(tx, userId, active, capturedAt)
    await rewireOptionsThroughParents(tx, active)
    await pruneVanishedTickets(tx, userId, fetchedIds)
    await pruneObsoleteOptions(tx, fetchedIds)
  })

  lastSyncAt.set(userId, Date.now())
  log.debug({ userId, count: active.length }, 'sync complete')
}

async function fetchUserTickets(u: UserScope, userId: string): Promise<PraamidTicket[] | null> {
  try {
    return await u.ticket.list()
  } catch (err) {
    log.debug(
      { userId, err: err instanceof Error ? err.message : String(err) },
      'ticket.list failed',
    )
    return null
  }
}

function filterActiveFuture(raw: PraamidTicket[]): PraamidTicket[] {
  const now = Date.now()
  return raw
    .filter((t) => t.status.code === 'ACTIVE')
    .filter((t) => {
      const ts = Date.parse(t.event.dtstart)
      return !Number.isNaN(ts) && ts > now
    })
}

async function upsertActiveTickets(
  tx: Tx,
  userId: string,
  active: PraamidTicket[],
  capturedAt: Date,
): Promise<void> {
  for (const t of active) {
    const eventDtstart = new Date(t.event.dtstart)
    await tx
      .insert(tickets)
      .values({
        id: t.id,
        userId,
        bookingUid: t.bookingUid,
        bookingReferenceNumber: t.bookingReferenceNumber,
        sequenceNumber: t.sequenceNumber,
        ticketCode: t.ticketCode,
        ticketNumber: t.ticketNumber,
        direction: t.direction.code,
        measurementUnit: DEFAULT_MEASUREMENT_UNIT,
        eventUid: t.event.uid,
        eventDtstart,
        ticketDate: t.ticketDate,
        parentTicketId: t.parentTicketId ?? null,
        capturedAt,
      })
      .onConflictDoUpdate({
        target: tickets.id,
        set: {
          userId,
          bookingUid: t.bookingUid,
          bookingReferenceNumber: t.bookingReferenceNumber,
          sequenceNumber: t.sequenceNumber,
          ticketCode: t.ticketCode,
          ticketNumber: t.ticketNumber,
          direction: t.direction.code,
          eventUid: t.event.uid,
          eventDtstart,
          ticketDate: t.ticketDate,
          parentTicketId: t.parentTicketId ?? null,
          capturedAt,
        },
      })
  }
}

// Move options from each ticket's predecessor to itself. Order doesn't
// matter — at most one parent->child step per sync because parentTicketId
// is set when the ticket is born.
async function rewireOptionsThroughParents(tx: Tx, active: PraamidTicket[]): Promise<void> {
  for (const t of active) {
    if (t.parentTicketId == null) continue
    await tx
      .update(ticketOptions)
      .set({ ticketId: t.id })
      .where(eq(ticketOptions.ticketId, t.parentTicketId))
  }
}

async function pruneVanishedTickets(tx: Tx, userId: string, fetchedIds: number[]): Promise<void> {
  if (fetchedIds.length === 0) {
    await tx.delete(tickets).where(eq(tickets.userId, userId))
    return
  }
  await tx
    .delete(tickets)
    .where(and(eq(tickets.userId, userId), notInArray(tickets.id, fetchedIds)))
}

// Drop the option whose event matches the current ticket plus everything
// worse than it. Folds the "drop-current-and-below" rule into sync so it
// works regardless of which path produced the alignment (auto-swap, manual
// swap, etc).
async function pruneObsoleteOptions(tx: Tx, fetchedIds: number[]): Promise<void> {
  if (fetchedIds.length === 0) return

  const matched = await tx
    .select({
      ticketId: ticketOptions.ticketId,
      priority: ticketOptions.priority,
    })
    .from(ticketOptions)
    .innerJoin(
      tickets,
      and(eq(ticketOptions.ticketId, tickets.id), eq(ticketOptions.eventUid, tickets.eventUid)),
    )
    .where(inArray(tickets.id, fetchedIds))

  for (const m of matched) {
    await tx
      .delete(ticketOptions)
      .where(
        and(
          eq(ticketOptions.ticketId, m.ticketId),
          sql`${ticketOptions.priority} >= ${m.priority}`,
        ),
      )
  }
}

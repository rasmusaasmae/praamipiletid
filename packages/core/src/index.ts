import { randomUUID } from 'node:crypto'

import {
  ticketOptions,
  tickets,
  ticketSyncs,
  type Db,
  type Ticket,
  type TicketOption,
} from '@ferry-tickets/db'
import type { Praamid } from '@ferry-tickets/praamidee'
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'

export const DEFAULT_STOP_BEFORE_MINUTES = 60

export type TicketWithOptions = {
  ticket: Ticket
  options: TicketOption[]
}

// A rule a user's request broke; safe to show to that user.
export class TicketsError extends Error {
  constructor(
    public code:
      | 'ticket_not_found'
      | 'option_not_found'
      | 'event_not_found'
      | 'current_event'
      | 'duplicate_option',
  ) {
    super(code)
    this.name = 'TicketsError'
  }
}

export function createTickets({ db, praamid }: { db: Db; praamid: Praamid }) {
  async function ownedTicket(userId: string, ticketId: number) {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.userId, userId), eq(tickets.id, ticketId)))
      .limit(1)
    if (!ticket) throw new TicketsError('ticket_not_found')
    return ticket
  }

  async function ownedOption(userId: string, optionId: string) {
    const [row] = await db
      .select({ option: ticketOptions })
      .from(ticketOptions)
      .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
      .where(and(eq(ticketOptions.id, optionId), eq(tickets.userId, userId)))
      .limit(1)
    if (!row) throw new TicketsError('option_not_found')
    return row.option
  }

  return {
    // The user's tickets, soonest first, each with its options best first.
    async list(userId: string): Promise<TicketWithOptions[]> {
      const rows = await db
        .select()
        .from(tickets)
        .leftJoin(ticketOptions, eq(ticketOptions.ticketId, tickets.id))
        .where(eq(tickets.userId, userId))
        .orderBy(asc(tickets.eventDtstart), asc(ticketOptions.priority))

      const byTicket = new Map<number, TicketWithOptions>()
      for (const row of rows) {
        let entry = byTicket.get(row.tickets.id)
        if (!entry) {
          entry = { ticket: row.tickets, options: [] }
          byTicket.set(row.tickets.id, entry)
        }
        if (row.ticket_options) entry.options.push(row.ticket_options)
      }
      return [...byTicket.values()]
    },

    // When the user's tickets were last fetched from praamid.ee; null until
    // the worker next syncs them.
    async syncedAt(userId: string): Promise<Date | null> {
      const [row] = await db
        .select({ syncedAt: ticketSyncs.syncedAt })
        .from(ticketSyncs)
        .where(eq(ticketSyncs.userId, userId))
      return row?.syncedAt ?? null
    },

    // Marks the user's copy stale so the worker's next cycle syncs it.
    async requestSync(userId: string): Promise<void> {
      await db.delete(ticketSyncs).where(eq(ticketSyncs.userId, userId))
    },

    // The day's departures in the ticket's direction, earliest first.
    async departures(userId: string, ticketId: number, date: string) {
      const ticket = await ownedTicket(userId, ticketId)
      const events = await praamid.events(ticket.direction, date)
      return events.toSorted((a, b) => Date.parse(a.dtstart) - Date.parse(b.dtstart))
    },

    // Adds a departure the user would rather be on, at the bottom of the
    // ticket's priority list.
    async addOption(
      userId: string,
      input: { ticketId: number; eventUid: string; date: string; stopBeforeMinutes?: number },
    ): Promise<TicketOption> {
      const ticket = await ownedTicket(userId, input.ticketId)
      if (ticket.eventUid === input.eventUid) throw new TicketsError('current_event')

      const events = await praamid.events(ticket.direction, input.date)
      const event = events.find((e) => e.uid === input.eventUid)
      if (!event) throw new TicketsError('event_not_found')

      const [duplicate] = await db
        .select({ id: ticketOptions.id })
        .from(ticketOptions)
        .where(
          and(eq(ticketOptions.ticketId, ticket.id), eq(ticketOptions.eventUid, input.eventUid)),
        )
        .limit(1)
      if (duplicate) throw new TicketsError('duplicate_option')

      const [last] = await db
        .select({ priority: ticketOptions.priority })
        .from(ticketOptions)
        .where(eq(ticketOptions.ticketId, ticket.id))
        .orderBy(desc(ticketOptions.priority))
        .limit(1)

      const [option] = await db
        .insert(ticketOptions)
        .values({
          id: randomUUID(),
          ticketId: ticket.id,
          priority: (last?.priority ?? 0) + 1,
          eventUid: input.eventUid,
          eventDate: input.date,
          eventDtstart: new Date(event.dtstart),
          stopBeforeMinutes: input.stopBeforeMinutes ?? DEFAULT_STOP_BEFORE_MINUTES,
        })
        .returning()
      return option!
    },

    async setCutoff(userId: string, optionId: string, stopBeforeMinutes: number): Promise<void> {
      const option = await ownedOption(userId, optionId)
      await db
        .update(ticketOptions)
        .set({ stopBeforeMinutes })
        .where(eq(ticketOptions.id, option.id))
    },

    async removeOption(userId: string, optionId: string): Promise<void> {
      const option = await ownedOption(userId, optionId)
      await db.delete(ticketOptions).where(eq(ticketOptions.id, option.id))
    },

    // Swaps an option's priority with its neighbour above or below.
    async moveOption(userId: string, optionId: string, direction: 'up' | 'down'): Promise<void> {
      const option = await ownedOption(userId, optionId)
      const [neighbour] = await db
        .select({ id: ticketOptions.id, priority: ticketOptions.priority })
        .from(ticketOptions)
        .where(
          and(
            eq(ticketOptions.ticketId, option.ticketId),
            direction === 'up'
              ? lt(ticketOptions.priority, option.priority)
              : gt(ticketOptions.priority, option.priority),
          ),
        )
        .orderBy(direction === 'up' ? desc(ticketOptions.priority) : asc(ticketOptions.priority))
        .limit(1)
      if (!neighbour) return

      // Priorities are unique per ticket, so park one option out of the way
      // while the other takes its place.
      await db.transaction(async (tx) => {
        await tx.update(ticketOptions).set({ priority: -1 }).where(eq(ticketOptions.id, option.id))
        await tx
          .update(ticketOptions)
          .set({ priority: option.priority })
          .where(eq(ticketOptions.id, neighbour.id))
        await tx
          .update(ticketOptions)
          .set({ priority: neighbour.priority })
          .where(eq(ticketOptions.id, option.id))
      })
    },
  }
}

export type Tickets = ReturnType<typeof createTickets>

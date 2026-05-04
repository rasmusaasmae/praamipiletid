'use server'

import { asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { ticketOptions, tickets, type Ticket, type TicketOption } from '@/db/schema'
import { requireSession } from '@/lib/auth'
import { praamidee, type AuthInfo } from '@/lib/praamidee'

export type TicketWithOptions = {
  ticket: Ticket
  options: TicketOption[]
}

export async function getTicketsWithOptions(): Promise<TicketWithOptions[]> {
  const session = await requireSession()
  const rows = await db
    .select()
    .from(tickets)
    .leftJoin(ticketOptions, eq(ticketOptions.ticketId, tickets.id))
    .where(eq(tickets.userId, session.user.id))
    .orderBy(asc(tickets.eventDtstart), asc(ticketOptions.priority))

  const byTicket = new Map<number, TicketWithOptions>()
  for (const row of rows) {
    const t = row.tickets
    let entry = byTicket.get(t.id)
    if (!entry) {
      entry = { ticket: t, options: [] }
      byTicket.set(t.id, entry)
    }
    if (row.ticket_options) entry.options.push(row.ticket_options)
  }
  return Array.from(byTicket.values())
}

export async function getMyPraamidAuthState(): Promise<AuthInfo> {
  const session = await requireSession()
  return praamidee.user(session.user.id).auth.get()
}

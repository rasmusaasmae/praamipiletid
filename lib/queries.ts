'use server'

import { asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db } from '@/db'
import {
  praamidAuthState,
  ticketOptions,
  tickets,
  type PraamidAuthStatus,
  type Ticket,
  type TicketOption,
} from '@/db/schema'
import { auth } from '@/lib/auth'

export type TicketWithOptions = {
  ticket: Ticket
  options: TicketOption[]
}

export type PraamidAuthStateView = {
  status: PraamidAuthStatus
  lastError: string | null
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthenticated')
  return session
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

export async function getMyPraamidAuthState(): Promise<PraamidAuthStateView> {
  const session = await requireSession()
  const [row] = await db
    .select({ status: praamidAuthState.status, lastError: praamidAuthState.lastError })
    .from(praamidAuthState)
    .where(eq(praamidAuthState.userId, session.user.id))
    .limit(1)
  return {
    status: (row?.status as PraamidAuthStatus | undefined) ?? 'unauthenticated',
    lastError: row?.lastError ?? null,
  }
}

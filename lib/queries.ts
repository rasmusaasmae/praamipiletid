import { and, asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { queryOptions } from '@tanstack/react-query'
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
  'use server'
  const session = await requireSession()
  const rows = await db
    .select()
    .from(tickets)
    .leftJoin(
      ticketOptions,
      and(
        eq(ticketOptions.userId, tickets.userId),
        eq(ticketOptions.bookingUid, tickets.bookingUid),
      ),
    )
    .where(eq(tickets.userId, session.user.id))
    .orderBy(asc(tickets.eventDtstart), asc(ticketOptions.priority))

  const byBooking = new Map<string, TicketWithOptions>()
  for (const row of rows) {
    const t = row.tickets
    let entry = byBooking.get(t.bookingUid)
    if (!entry) {
      entry = { ticket: t, options: [] }
      byBooking.set(t.bookingUid, entry)
    }
    if (row.ticket_options) entry.options.push(row.ticket_options)
  }
  return Array.from(byBooking.values())
}

export async function getMyPraamidAuthState(): Promise<PraamidAuthStateView> {
  'use server'
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

export const ticketsQueryOptions = queryOptions({
  queryKey: ['tickets'] as const,
  queryFn: () => getTicketsWithOptions(),
})

export const praamidAuthStateQueryOptions = queryOptions({
  queryKey: ['praamidAuthState'] as const,
  queryFn: () => getMyPraamidAuthState(),
})

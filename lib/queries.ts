'use server'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/db'
import { praamidAuthState, ticketOptions, tickets, type PraamidAuthStatus } from '@/db/schema'
import { auth } from '@/lib/auth'
import type { PraamidAuthStateView, TicketCardData } from './query-options'

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthenticated')
  return session
}

export async function getMyTicketCards(): Promise<TicketCardData[]> {
  const session = await requireSession()
  const userId = session.user.id

  const [myTickets, myOptions] = await Promise.all([
    db.select().from(tickets).where(eq(tickets.userId, userId)),
    db.select().from(ticketOptions).where(eq(ticketOptions.userId, userId)),
  ])

  const optionsByBooking = new Map<string, typeof myOptions>()
  for (const o of myOptions) {
    const list = optionsByBooking.get(o.bookingUid) ?? []
    list.push(o)
    optionsByBooking.set(o.bookingUid, list)
  }

  return myTickets
    .map<TicketCardData>((ticket) => {
      const opts = (optionsByBooking.get(ticket.bookingUid) ?? []).sort(
        (a, b) => a.priority - b.priority,
      )
      return {
        ticket: {
          userId: ticket.userId,
          bookingUid: ticket.bookingUid,
          ticketId: ticket.ticketId,
          ticketCode: ticket.ticketCode,
          ticketNumber: ticket.ticketNumber,
          direction: ticket.direction,
          measurementUnit: ticket.measurementUnit,
          eventUid: ticket.eventUid,
          eventDtstart: ticket.eventDtstart,
          ticketDate: ticket.ticketDate,
          swapInProgress: ticket.swapInProgress,
          capturedAt: ticket.capturedAt,
        },
        options: opts.map((o) => ({
          id: o.id,
          bookingUid: o.bookingUid,
          priority: o.priority,
          eventUid: o.eventUid,
          eventDate: o.eventDate,
          eventDtstart: o.eventDtstart,
          stopBeforeMinutes: o.stopBeforeMinutes,
        })),
      }
    })
    .sort((a, b) => a.ticket.eventDtstart.getTime() - b.ticket.eventDtstart.getTime())
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

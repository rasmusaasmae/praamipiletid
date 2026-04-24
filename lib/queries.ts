'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { praamidAuthState, ticketOptions, tickets, user, type PraamidAuthStatus } from '@/db/schema'
import { requireAdmin, requireUser } from '@/lib/session'
import type {
  AdminDashboardData,
  AdminTicketRow,
  AdminUserRow,
  PraamidAuthStateView,
  TicketCardData,
} from './query-options'

export async function getMyTicketCards(): Promise<TicketCardData[]> {
  const session = await requireUser()
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
  const session = await requireUser()
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

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  await requireAdmin()

  const [users, allTickets, allOptions] = await Promise.all([
    db.select().from(user),
    db.select().from(tickets),
    db.select().from(ticketOptions),
  ])

  const ticketCountByUser = new Map<string, number>()
  for (const t of allTickets) {
    ticketCountByUser.set(t.userId, (ticketCountByUser.get(t.userId) ?? 0) + 1)
  }

  const userRows: AdminUserRow[] = [...users]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? 'user',
      banned: u.banned ?? false,
      createdAt: u.createdAt,
      subCount: ticketCountByUser.get(u.id) ?? 0,
    }))

  const emailById = new Map(users.map((u) => [u.id, u.email]))

  const optionsByBooking = new Map<string, number>()
  for (const o of allOptions) {
    optionsByBooking.set(o.bookingUid, (optionsByBooking.get(o.bookingUid) ?? 0) + 1)
  }

  const ticketRows: AdminTicketRow[] = allTickets
    .map<AdminTicketRow>((t) => ({
      userId: t.userId,
      userEmail: emailById.get(t.userId) ?? '—',
      bookingUid: t.bookingUid,
      ticketCode: t.ticketCode,
      direction: t.direction,
      measurementUnit: t.measurementUnit,
      eventUid: t.eventUid,
      eventDtstart: t.eventDtstart,
      optionsCount: optionsByBooking.get(t.bookingUid) ?? 0,
    }))
    .sort((a, b) => b.eventDtstart.getTime() - a.eventDtstart.getTime())

  return {
    users: userRows,
    tickets: ticketRows,
  }
}

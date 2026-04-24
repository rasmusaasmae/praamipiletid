'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/db'
import { tickets, trips } from '@/db/schema'
import {
  getCredential,
  invalidateCredential,
  markVerified,
} from '@/lib/praamid-credentials'
import {
  listTickets,
  PraamidAuthError,
  type Ticket as PraamidTicket,
} from '@/lib/praamid-authed'
import { logAudit } from '@/lib/audit'
import { requireUser } from '@/lib/session'

export type AttachableTicket = {
  ticketCode: string
  ticketNumber: string
  ticketDate: string
  bookingUid: string
  eventUid: string
  eventDtstart: string
  directionCode: string
}

async function fetchPraamidTickets(
  userId: string,
  errT: Awaited<ReturnType<typeof getTranslations<'Errors'>>>,
): Promise<PraamidTicket[]> {
  const credential = await getCredential(userId)
  if (!credential) throw new Error(errT('noCredential'))
  if (credential.expiresAt.getTime() <= Date.now()) {
    throw new Error(errT('credentialExpired'))
  }
  try {
    const rawTickets = await listTickets(credential.token)
    await markVerified(userId)
    return rawTickets
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `listTickets ${err.status}`)
      throw new Error(errT('credentialExpired'))
    }
    throw new Error(errT('praamidError'))
  }
}

const ListAttachableDto = z.object({ tripId: z.string().min(1) })

export async function listAttachableTickets(
  dto: z.input<typeof ListAttachableDto>,
): Promise<AttachableTicket[]> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = ListAttachableDto.safeParse(dto)
  if (!parsed.success) throw new Error(errT('missingId'))

  const [trip] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!trip) throw new Error(errT('tripNotFound'))

  const fetched = await fetchPraamidTickets(session.user.id, errT)
  const now = Date.now()

  return fetched
    .filter((raw) => raw.status.code === 'ACTIVE')
    .filter((raw) => raw.direction.code === trip.direction)
    .filter((raw) => {
      const ts = Date.parse(raw.event.dtstart)
      return !Number.isNaN(ts) && ts > now
    })
    .map((raw) => ({
      ticketCode: raw.ticketCode,
      ticketNumber: raw.ticketNumber,
      ticketDate: raw.ticketDate,
      bookingUid: raw.bookingUid,
      eventUid: raw.event.uid,
      eventDtstart: raw.event.dtstart,
      directionCode: raw.direction.code,
    }))
    .sort((a, b) => Date.parse(a.eventDtstart) - Date.parse(b.eventDtstart))
}

const AttachTicketDto = z.object({
  tripId: z.string().min(1),
  ticketCode: z.string().min(1),
})

export async function attachTicket(
  dto: z.input<typeof AttachTicketDto>,
): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = AttachTicketDto.safeParse(dto)
  if (!parsed.success) throw new Error(errT('invalidData'))

  const [trip] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!trip) throw new Error(errT('tripNotFound'))

  const fetched = await fetchPraamidTickets(session.user.id, errT)
  const raw = fetched.find(
    (t) => t.ticketCode === parsed.data.ticketCode && t.direction.code === trip.direction,
  )
  if (!raw) throw new Error(errT('ticketNotFound'))

  const eventDtstart = new Date(raw.event.dtstart)
  if (Number.isNaN(eventDtstart.getTime())) {
    throw new Error(errT('invalidData'))
  }

  const now = new Date()
  await db
    .insert(tickets)
    .values({
      tripId: trip.id,
      userId: session.user.id,
      ticketCode: raw.ticketCode,
      ticketNumber: raw.ticketNumber,
      bookingUid: raw.bookingUid,
      eventUid: raw.event.uid,
      ticketDate: raw.ticketDate,
      eventDtstart,
      capturedAt: now,
    })
    .onConflictDoUpdate({
      target: tickets.tripId,
      set: {
        ticketCode: raw.ticketCode,
        ticketNumber: raw.ticketNumber,
        bookingUid: raw.bookingUid,
        eventUid: raw.event.uid,
        ticketDate: raw.ticketDate,
        eventDtstart,
        capturedAt: now,
      },
    })

  await logAudit({
    type: 'ticket.attached',
    actor: 'user',
    userId: session.user.id,
    tripId: trip.id,
    payload: {
      ticketCode: raw.ticketCode,
      bookingUid: raw.bookingUid,
      eventUid: raw.event.uid,
    },
  })

  revalidatePath('/')
}

const DetachTicketDto = z.object({ tripId: z.string().min(1) })

export async function detachTicket(
  dto: z.input<typeof DetachTicketDto>,
): Promise<void> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = DetachTicketDto.safeParse(dto)
  if (!parsed.success) throw new Error(errT('missingId'))

  const [owned] = await db
    .select({ id: trips.id, edit: trips.edit })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!owned) throw new Error(errT('tripNotFound'))

  const [existing] = await db
    .select({ ticketCode: tickets.ticketCode })
    .from(tickets)
    .where(eq(tickets.tripId, parsed.data.tripId))
    .limit(1)
  if (!existing) return

  await db.transaction(async (tx) => {
    await tx.delete(tickets).where(eq(tickets.tripId, parsed.data.tripId))
    if (owned.edit) {
      await tx.update(trips).set({ edit: false }).where(eq(trips.id, parsed.data.tripId))
    }
  })

  await logAudit({
    type: 'ticket.detached',
    actor: 'user',
    userId: session.user.id,
    tripId: parsed.data.tripId,
    payload: { ticketCode: existing.ticketCode, reason: 'user' },
  })

  revalidatePath('/')
}

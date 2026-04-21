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

export type ActionResult = { ok: true } | { ok: false; error: string }

export type AttachableTicket = {
  ticketCode: string
  ticketNumber: string
  ticketDate: string
  bookingUid: string
  eventUid: string
  eventDtstart: string
  directionCode: string
}

export type ListAttachableResult =
  | { ok: true; tickets: AttachableTicket[] }
  | { ok: false; error: string }

async function fetchPraamidTickets(
  userId: string,
  errT: Awaited<ReturnType<typeof getTranslations<'Errors'>>>,
): Promise<{ ok: true; tickets: PraamidTicket[] } | { ok: false; error: string }> {
  const credential = await getCredential(userId)
  if (!credential) return { ok: false, error: errT('noCredential') }
  if (credential.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: errT('credentialExpired') }
  }
  try {
    const rawTickets = await listTickets(credential.token)
    await markVerified(userId)
    return { ok: true, tickets: rawTickets }
  } catch (err) {
    if (err instanceof PraamidAuthError && (err.status === 401 || err.status === 403)) {
      await invalidateCredential(userId, `listTickets ${err.status}`)
      return { ok: false, error: errT('credentialExpired') }
    }
    return { ok: false, error: errT('praamidError') }
  }
}

export async function listAttachableTickets(tripId: string): Promise<ListAttachableResult> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const [trip] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!trip) return { ok: false, error: errT('tripNotFound') }

  const fetched = await fetchPraamidTickets(session.user.id, errT)
  if (!fetched.ok) return fetched

  const now = Date.now()

  const results: AttachableTicket[] = fetched.tickets
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

  return { ok: true, tickets: results }
}

const attachSchema = z.object({
  tripId: z.string().min(1),
  ticketCode: z.string().min(1),
})

export async function attachTicket(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = attachSchema.safeParse({
    tripId: formData.get('tripId'),
    ticketCode: formData.get('ticketCode'),
  })
  if (!parsed.success) return { ok: false, error: errT('invalidData') }

  const [trip] = await db
    .select({ id: trips.id, direction: trips.direction })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!trip) return { ok: false, error: errT('tripNotFound') }

  const fetched = await fetchPraamidTickets(session.user.id, errT)
  if (!fetched.ok) return fetched

  const raw = fetched.tickets.find(
    (t) => t.ticketCode === parsed.data.ticketCode && t.direction.code === trip.direction,
  )
  if (!raw) return { ok: false, error: errT('ticketNotFound') }

  const eventDtstart = new Date(raw.event.dtstart)
  if (Number.isNaN(eventDtstart.getTime())) {
    return { ok: false, error: errT('invalidData') }
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
  return { ok: true }
}

const detachSchema = z.object({ tripId: z.string().min(1) })

export async function detachTicket(formData: FormData): Promise<ActionResult> {
  const session = await requireUser()
  const errT = await getTranslations('Errors')

  const parsed = detachSchema.safeParse({ tripId: formData.get('tripId') })
  if (!parsed.success) return { ok: false, error: errT('missingId') }

  const [owned] = await db
    .select({ id: trips.id, edit: trips.edit })
    .from(trips)
    .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, session.user.id)))
    .limit(1)
  if (!owned) return { ok: false, error: errT('tripNotFound') }

  const [existing] = await db
    .select({ ticketCode: tickets.ticketCode })
    .from(tickets)
    .where(eq(tickets.tripId, parsed.data.tripId))
    .limit(1)
  if (!existing) return { ok: true }

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
  return { ok: true }
}

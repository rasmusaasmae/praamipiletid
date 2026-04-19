import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/db'
import { auditLogs } from '@/db/schema'

export type AuditPayload = {
  'trip.created': { direction: string; measurementUnit: string; threshold: number }
  'trip.updated': { changes: Record<string, unknown> }
  'trip.deleted': { direction: string }
  'option.added': { eventUid: string; priority: number }
  'option.removed': { eventUid: string; priority: number }
  'option.reordered': { from: number; to: number; eventUid: string }
  'option.paused': { eventUid: string; priority: number }
  'option.resumed': { eventUid: string; priority: number }
  'ticket.attached': { ticketCode: string; bookingUid: string; eventUid: string }
  'ticket.detached': { ticketCode: string; reason: string }
  'credential.captured': { expiresAt: string; praamidSub: string }
  'credential.verified': Record<string, never>
  'credential.expired': Record<string, never>
  'credential.forgotten': Record<string, never>
  'notification.threshold_crossed': {
    eventUid: string
    from: 'above' | 'below' | null
    to: 'above' | 'below'
    capacity: number
    threshold: number
    priority: number
  }
  'notification.credential_expiring': {
    expiresAt: string
    hoursLeft: number
  }
  'edit.attempted': {
    fromEventUid: string
    toEventUid: string
    toPriority: number
    ticketCode: string
    targetEventDtstart: number
  }
  'edit.succeeded': {
    newTicketCode: string
    newTicketNumber: string
    newInvoiceNumber: string
    fromEventUid: string
    toEventUid: string
    toPriority: number
  }
  'edit.failed': {
    stage: 'put' | 'balance' | 'commit' | 'auth' | 'idempotency' | 'internal'
    httpStatus?: number
    errorMessage?: string
    reason: string
  }
  'edit.rolled_back': { reason: string }
  'system.poller_tick_error': { error: string }
}

export type AuditType = keyof AuditPayload

export type LogAuditArgs<T extends AuditType> = {
  type: T
  actor: 'user' | 'system'
  userId?: string | null
  tripId?: string | null
  payload: AuditPayload[T]
}

export async function logAudit<T extends AuditType>(args: LogAuditArgs<T>): Promise<void> {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    userId: args.userId ?? null,
    actor: args.actor,
    type: args.type,
    tripId: args.tripId ?? null,
    payload: JSON.stringify(args.payload),
  })
}

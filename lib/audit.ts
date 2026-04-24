import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/db'
import { auditLogs } from '@/db/schema'

export type AuditPayload = {
  'ticket.subscribed': { bookingUid: string; ticketCode: string; eventUid: string }
  'ticket.unsubscribed': { bookingUid: string; ticketCode: string; reason: string }
  'option.added': { bookingUid: string; eventUid: string; priority: number }
  'option.removed': { bookingUid: string; eventUid: string; priority: number }
  'option.reordered': { bookingUid: string; from: number; to: number; eventUid: string }
  'option.updated': { bookingUid: string; eventUid: string; stopBeforeMinutes: number }
  'credential.captured': { expiresAt: string; praamidSub: string }
  'credential.verified': Record<string, never>
  'credential.expired': Record<string, never>
  'credential.forgotten': Record<string, never>
  'edit.attempted': {
    bookingUid: string
    fromEventUid: string
    toEventUid: string
    toPriority: number
    ticketCode: string
    targetEventDtstart: number
  }
  'edit.succeeded': {
    bookingUid: string
    newBookingUid?: string
    bookingUidChanged?: boolean
    newTicketCode: string
    newTicketNumber: string
    newInvoiceNumber: string
    fromEventUid: string
    toEventUid: string
    toPriority: number
  }
  'edit.failed': {
    bookingUid: string
    stage: 'put' | 'balance' | 'commit' | 'auth' | 'idempotency' | 'internal'
    httpStatus?: number
    errorMessage?: string
    reason: string
  }
  'edit.rolled_back': { bookingUid: string; reason: string }
  'swap.started': { bookingUid: string }
  'swap.finished': { bookingUid: string }
  'swap.recovered': { bookingUid: string; reason: 'worker_boot' }
  'system.poller_tick_error': { error: string }
}

export type AuditType = keyof AuditPayload

export type LogAuditArgs<T extends AuditType> = {
  type: T
  actor: 'user' | 'system'
  userId?: string | null
  payload: AuditPayload[T]
}

export async function logAudit<T extends AuditType>(args: LogAuditArgs<T>): Promise<void> {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    userId: args.userId ?? null,
    actor: args.actor,
    type: args.type,
    payload: JSON.stringify(args.payload),
  })
}

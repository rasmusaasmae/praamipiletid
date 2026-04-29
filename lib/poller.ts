import 'server-only'
import { eq, gt } from 'drizzle-orm'

import { db } from '@/db'
import { praamidCredentials, ticketOptions, tickets } from '@/db/schema'
import { processSwapFor } from '@/lib/edit'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { listEvents } from '@/lib/praamid/api'
import type { PraamidEvent } from '@/lib/praamid/types'
import { syncTicketsForUser } from '@/lib/sync-tickets'

const log = logger.child({ scope: 'poller' })

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS ?? 15_000))
const MIRROR_SYNC_INTERVAL_MS = 10 * 60 * 1000
// Praamid's events endpoint accepts a time-shift in seconds that biases
// the schedule window we get back. 300s (5min) is the value the official
// site uses; we follow.
const POLL_TIME_SHIFT = 300

let running = false
let lastMirrorSyncAt = 0

type JoinedOption = {
  optionId: string
  ticketId: number
  userId: string
  direction: string
  measurementUnit: string
  priority: number
  eventUid: string
  eventDate: string
  eventDtstart: Date
  stopBeforeMinutes: number
  currentTicketEventUid: string
}

async function loadBatchEvents(
  dir: string,
  date: string,
  timeShift: number,
): Promise<PraamidEvent[] | null> {
  try {
    return await listEvents(dir, date, timeShift)
  } catch (err) {
    log.error(
      { dir, date, err: err instanceof Error ? err.message : String(err) },
      'listEvents failed',
    )
    return null
  }
}

async function tick() {
  const now = new Date()
  const rows = await db
    .select({
      optionId: ticketOptions.id,
      ticketId: tickets.id,
      userId: tickets.userId,
      direction: tickets.direction,
      measurementUnit: tickets.measurementUnit,
      priority: ticketOptions.priority,
      eventUid: ticketOptions.eventUid,
      eventDate: ticketOptions.eventDate,
      eventDtstart: ticketOptions.eventDtstart,
      stopBeforeMinutes: ticketOptions.stopBeforeMinutes,
      currentTicketEventUid: tickets.eventUid,
    })
    .from(ticketOptions)
    .innerJoin(tickets, eq(tickets.id, ticketOptions.ticketId))
    .where(gt(ticketOptions.eventDtstart, now))

  const due: JoinedOption[] = rows.filter(
    (r) => r.eventDtstart.getTime() - r.stopBeforeMinutes * 60_000 > now.getTime(),
  )
  if (due.length === 0) return

  const batches = new Map<string, JoinedOption[]>()
  for (const r of due) {
    const key = `${r.direction}|${r.eventDate}`
    const list = batches.get(key) ?? []
    list.push(r)
    batches.set(key, list)
  }

  const eventsByUid = new Map<string, PraamidEvent>()
  const openedRowsByTicket = new Map<number, JoinedOption[]>()

  for (const [key, batch] of batches) {
    const [dir, date] = key.split('|') as [string, string]
    const events = await loadBatchEvents(dir, date, POLL_TIME_SHIFT)
    if (!events) continue
    for (const e of events) eventsByUid.set(e.uid, e)
    const batchEventByUid = new Map(events.map((e) => [e.uid, e]))

    for (const row of batch) {
      const event = batchEventByUid.get(row.eventUid)
      if (!event) continue
      if (row.eventUid === row.currentTicketEventUid) continue
      const capacity = event.capacities?.[row.measurementUnit] ?? 0
      if (capacity < 1) continue
      const list = openedRowsByTicket.get(row.ticketId) ?? []
      list.push(row)
      openedRowsByTicket.set(row.ticketId, list)
    }
  }

  if (openedRowsByTicket.size === 0) return

  for (const [ticketId, openedRows] of openedRowsByTicket) {
    const userId = openedRows[0]!.userId
    const openedEventUids = new Set(openedRows.map((r) => r.eventUid))

    await db.update(tickets).set({ swapInProgress: true }).where(eq(tickets.id, ticketId))
    log.info({ ticketId, userId }, 'swap started')
    try {
      const outcome = await processSwapFor({
        userId,
        ticketId,
        openedEventUids,
        eventsByUid,
      })
      if (outcome.kind === 'succeeded') {
        try {
          await sendEmail({
            userId,
            subject: 'Ticket updated',
            body: `New ticket ${outcome.newTicketNumber} (invoice ${outcome.invoiceNumber})`,
          })
        } catch (err) {
          log.error(
            {
              ticketId,
              err: err instanceof Error ? err.message : String(err),
            },
            'swap notify failed',
          )
        }
      }
    } catch (err) {
      log.error(
        {
          ticketId,
          err: err instanceof Error ? err.message : String(err),
        },
        'processSwapFor threw',
      )
    } finally {
      // The ticket id may no longer exist after a successful swap (sync
      // dropped it and inserted the successor). The UPDATE just no-ops.
      await db.update(tickets).set({ swapInProgress: false }).where(eq(tickets.id, ticketId))
      log.info({ ticketId, userId }, 'swap finished')
    }
  }
}

async function mirrorSyncTick() {
  if (Date.now() - lastMirrorSyncAt < MIRROR_SYNC_INTERVAL_MS) return
  lastMirrorSyncAt = Date.now()

  const userIds = await db.select({ userId: praamidCredentials.userId }).from(praamidCredentials)

  for (const { userId } of userIds) {
    try {
      await syncTicketsForUser(userId)
    } catch (err) {
      log.error(
        { userId, err: err instanceof Error ? err.message : String(err) },
        'mirror sync failed',
      )
    }
  }
}

async function loop() {
  while (true) {
    const started = Date.now()
    try {
      await tick()
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'tick failed')
    }
    try {
      await mirrorSyncTick()
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'mirrorSyncTick failed')
    }
    const elapsed = Date.now() - started
    const delay = Math.max(1000, POLL_INTERVAL_MS - elapsed)
    log.debug({ elapsedMs: elapsed, nextDelayMs: delay }, 'tick complete')
    await new Promise((r) => setTimeout(r, delay))
  }
}

async function recoverStuckSwaps() {
  // Worker owns swap_in_progress. If we're starting, nothing is in flight —
  // clear any leftovers from a prior crash.
  const stuck = await db
    .update(tickets)
    .set({ swapInProgress: false })
    .where(eq(tickets.swapInProgress, true))
    .returning({ id: tickets.id, userId: tickets.userId })
  if (stuck.length > 0) {
    log.warn({ count: stuck.length, rows: stuck }, 'cleared stuck swap_in_progress on worker boot')
  }
}

export function startPoller() {
  if (running) return
  running = true
  log.info('starting')
  recoverStuckSwaps()
    .catch((err) => {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'recoverStuckSwaps failed',
      )
    })
    .finally(() => {
      loop().catch((err) => {
        log.error({ err: err instanceof Error ? err.message : String(err) }, 'loop crashed')
        running = false
      })
    })
}

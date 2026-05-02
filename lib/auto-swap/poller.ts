import 'server-only'
import { eq, gt } from 'drizzle-orm'

import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { praamidee, type PraamidEvent } from '@/lib/praamidee'

import { processAutoSwap } from './engine'
import { syncTicketsForUser } from './sync'

const log = logger.child({ scope: 'poller' })

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS ?? 10_000))
const MIRROR_SYNC_INTERVAL_MS = 10 * 60 * 1000
// Praamid's events endpoint accepts a time-shift in seconds that biases
// the schedule window we get back. 300s (5min) is the value the official
// site uses; we follow.
const POLL_TIME_SHIFT = 300

let running = false
let lastMirrorSyncAt = 0

type DueOption = {
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

// Top-level swap tick — five named phases.
async function tick() {
  const due = await loadDueOptions()
  if (due.length === 0) return

  const events = await fetchEventsForBatches(due)
  await refreshDriftedDtstarts(due, events)

  const openedByTicket = findOpenedSlots(due, events)
  if (openedByTicket.size === 0) return

  await runSwapsAndNotify(openedByTicket, events)
}

// Phase 1 — DB read + due-time filter --------------------------------------

async function loadDueOptions(): Promise<DueOption[]> {
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

  return rows.filter((r) => r.eventDtstart.getTime() - r.stopBeforeMinutes * 60_000 > now.getTime())
}

// Phase 2 — fetch events for each (direction, date) bucket -----------------

async function fetchEventsForBatches(due: DueOption[]): Promise<Map<string, PraamidEvent>> {
  const batchKeys = new Set<string>()
  for (const r of due) batchKeys.add(`${r.direction}|${r.eventDate}`)

  const eventsByUid = new Map<string, PraamidEvent>()
  for (const key of batchKeys) {
    const [dir, date] = key.split('|') as [string, string]
    const events = await loadBatchEvents(dir, date, POLL_TIME_SHIFT)
    if (!events) continue
    for (const e of events) eventsByUid.set(e.uid, e)
  }
  return eventsByUid
}

async function loadBatchEvents(
  dir: string,
  date: string,
  timeShift: number,
): Promise<PraamidEvent[] | null> {
  try {
    return await praamidee.event.list(dir, date, timeShift)
  } catch (err) {
    log.error(
      { dir, date, err: err instanceof Error ? err.message : String(err) },
      'event.list failed',
    )
    return null
  }
}

// Phase 3 — opportunistic correction of cached dtstart ---------------------

// Praamid sometimes reschedules a trip in place (the eventUid stays, only
// dtstart drifts). Cheap to reconcile while we already have the events in
// hand, so the next tick's due-time filter sees the right value.
async function refreshDriftedDtstarts(
  due: DueOption[],
  eventsByUid: Map<string, PraamidEvent>,
): Promise<void> {
  for (const row of due) {
    const event = eventsByUid.get(row.eventUid)
    if (!event) continue
    const liveDtstart = Date.parse(event.dtstart)
    if (Number.isNaN(liveDtstart) || liveDtstart === row.eventDtstart.getTime()) continue
    await db
      .update(ticketOptions)
      .set({ eventDtstart: new Date(liveDtstart) })
      .where(eq(ticketOptions.id, row.optionId))
  }
}

// Phase 4 — pure: which options are "opened" right now? --------------------

// An option is opened if it's not the ticket's current event and the live
// event has at least one unit of capacity in the ticket's measurement unit.
function findOpenedSlots(
  due: DueOption[],
  eventsByUid: Map<string, PraamidEvent>,
): Map<number, DueOption[]> {
  const openedByTicket = new Map<number, DueOption[]>()
  for (const row of due) {
    if (row.eventUid === row.currentTicketEventUid) continue
    const event = eventsByUid.get(row.eventUid)
    if (!event) continue
    const capacity = event.capacities?.[row.measurementUnit] ?? 0
    if (capacity < 1) continue
    const list = openedByTicket.get(row.ticketId) ?? []
    list.push(row)
    openedByTicket.set(row.ticketId, list)
  }
  return openedByTicket
}

// Phase 5 — hand each ticket to the engine; notify on success --------------

async function runSwapsAndNotify(
  openedByTicket: Map<number, DueOption[]>,
  eventsByUid: Map<string, PraamidEvent>,
): Promise<void> {
  for (const [ticketId, openedRows] of openedByTicket) {
    const userId = openedRows[0]!.userId
    const openedEventUids = new Set(openedRows.map((r) => r.eventUid))

    log.info({ ticketId, userId }, 'swap started')
    try {
      const outcome = await processAutoSwap({
        userId,
        ticketId,
        openedEventUids,
        eventsByUid,
      })
      if (outcome.kind === 'succeeded') {
        await notifySwapSuccess(userId, ticketId, outcome.newTicketNumber, outcome.invoiceNumber)
      }
    } catch (err) {
      log.error(
        { ticketId, err: err instanceof Error ? err.message : String(err) },
        'processAutoSwap threw',
      )
    } finally {
      log.info({ ticketId, userId }, 'swap finished')
    }
  }
}

async function notifySwapSuccess(
  userId: string,
  ticketId: number,
  newTicketNumber: string,
  invoiceNumber: string,
): Promise<void> {
  try {
    await sendEmail({
      userId,
      subject: 'Ticket updated',
      body: `New ticket ${newTicketNumber} (invoice ${invoiceNumber})`,
    })
  } catch (err) {
    log.error(
      { ticketId, err: err instanceof Error ? err.message : String(err) },
      'swap notify failed',
    )
  }
}

// Mirror sync tick + outer loop --------------------------------------------

async function mirrorSyncTick() {
  if (Date.now() - lastMirrorSyncAt < MIRROR_SYNC_INTERVAL_MS) return
  lastMirrorSyncAt = Date.now()

  const userIds = await praamidee.listAuthedUserIds()

  for (const userId of userIds) {
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

export function startPoller() {
  if (running) return
  running = true
  log.info('starting')
  loop().catch((err) => {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'loop crashed')
    running = false
  })
}

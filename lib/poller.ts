import 'server-only'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { listEvents, type PraamidEvent } from '@/lib/praamid'
import { sendEmail } from '@/lib/email'
import { processSwapFor } from '@/lib/edit'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'poller' })

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS ?? 15_000))
// Praamid's events endpoint accepts a time-shift in seconds that biases
// the schedule window we get back. 300s (5min) is the value the official
// site uses; we follow.
const POLL_TIME_SHIFT = 300

let running = false

type JoinedOption = {
  optionId: string
  bookingUid: string
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
      bookingUid: ticketOptions.bookingUid,
      userId: ticketOptions.userId,
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
    .innerJoin(
      tickets,
      and(
        eq(tickets.userId, ticketOptions.userId),
        eq(tickets.bookingUid, ticketOptions.bookingUid),
      ),
    )
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
  const openedRowsByBooking = new Map<string, JoinedOption[]>()

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
      const list = openedRowsByBooking.get(row.bookingUid) ?? []
      list.push(row)
      openedRowsByBooking.set(row.bookingUid, list)
    }
  }

  if (openedRowsByBooking.size === 0) return

  for (const [bookingUid, openedRows] of openedRowsByBooking) {
    const userId = openedRows[0]!.userId
    const openedEventUids = new Set(openedRows.map((r) => r.eventUid))

    await db
      .update(tickets)
      .set({ swapInProgress: true })
      .where(and(eq(tickets.userId, userId), eq(tickets.bookingUid, bookingUid)))
    log.info({ bookingUid, userId }, 'swap started')
    try {
      const outcome = await processSwapFor({
        userId,
        bookingUid,
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
              bookingUid,
              err: err instanceof Error ? err.message : String(err),
            },
            'swap notify failed',
          )
        }
      }
    } catch (err) {
      log.error(
        {
          bookingUid,
          err: err instanceof Error ? err.message : String(err),
        },
        'processSwapFor threw',
      )
    } finally {
      await db
        .update(tickets)
        .set({ swapInProgress: false })
        .where(and(eq(tickets.userId, userId), eq(tickets.bookingUid, bookingUid)))
      log.info({ bookingUid, userId }, 'swap finished')
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
    .returning({ userId: tickets.userId, bookingUid: tickets.bookingUid })
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

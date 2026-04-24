import 'server-only'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { ticketOptions, tickets } from '@/db/schema'
import { listEvents, type PraamidEvent } from '@/lib/praamid'
import { sendEmail } from '@/lib/email'
import { getAllSettings } from '@/lib/settings'
import { logAudit } from '@/lib/audit'
import { processSwapFor } from '@/lib/edit'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'poller' })

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
    await logAudit({
      type: 'system.poller_tick_error',
      actor: 'system',
      payload: { error: err instanceof Error ? err.message : String(err) },
    })
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

  const { pollTimeShift } = await getAllSettings()

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
    const events = await loadBatchEvents(dir, date, pollTimeShift)
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
    await logAudit({
      type: 'swap.started',
      actor: 'system',
      userId,
      payload: { bookingUid },
    })
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
      await logAudit({
        type: 'swap.finished',
        actor: 'system',
        userId,
        payload: { bookingUid },
      })
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
    const { pollIntervalMs } = await getAllSettings()
    const elapsed = Date.now() - started
    const delay = Math.max(1000, pollIntervalMs - elapsed)
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
  for (const row of stuck) {
    await logAudit({
      type: 'swap.recovered',
      actor: 'system',
      userId: row.userId,
      payload: { bookingUid: row.bookingUid, reason: 'worker_boot' },
    })
  }
  if (stuck.length > 0) {
    log.warn({ count: stuck.length }, 'cleared stuck swap_in_progress')
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

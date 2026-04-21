import 'server-only'
import { eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { tickets, tripOptions, trips, user } from '@/db/schema'
import { CAPACITY_LABELS, listEvents, type PraamidEvent } from '@/lib/praamid'
import { getNotifier } from '@/lib/notifier'
import { getAllSettings } from '@/lib/settings'
import { logAudit } from '@/lib/audit'
import { processEditForTrip } from '@/lib/edit'
import { createLogger } from '@/lib/logger'

const log = createLogger('poller')

let running = false
let stopRequested = false

type JoinedOption = {
  optionId: string
  tripId: string
  userId: string
  direction: string
  measurementUnit: string
  notify: boolean
  edit: boolean
  stopBeforeAt: Date
  priority: number
  eventUid: string
  eventDate: string
  eventDtstart: Date
  lastCapacity: number | null
  lastCapacityState: string | null
  currentTicketEventUid: string | null
}

function formatTime(date: Date) {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

async function processBatch(
  dir: string,
  date: string,
  rows: JoinedOption[],
  topicByUser: Map<string, string | null>,
  timeShift: number,
) {
  let events: PraamidEvent[]
  try {
    events = await listEvents(dir, date, timeShift)
  } catch (err) {
    log.error('listEvents failed', {
      dir,
      date,
      error: err instanceof Error ? err.message : String(err),
    })
    await logAudit({
      type: 'system.poller_tick_error',
      actor: 'system',
      payload: { error: err instanceof Error ? err.message : String(err) },
    })
    return
  }
  log.debug('processBatch', { dir, date, rows: rows.length, events: events.length })

  const eventByUid = new Map(events.map((e) => [e.uid, e]))

  for (const row of rows) {
    const event = eventByUid.get(row.eventUid)
    if (!event) continue
    const capacity = event.capacities?.[row.measurementUnit] ?? 0
    const nextState: 'above' | 'below' = capacity >= 1 ? 'above' : 'below'
    const prevState = row.lastCapacityState as 'above' | 'below' | null

    const transition: 'opened' | 'closed' | null =
      nextState === 'above' && prevState !== 'above'
        ? 'opened'
        : nextState === 'below' && prevState === 'above'
          ? 'closed'
          : null
    const isCurrentTicket = row.currentTicketEventUid === row.eventUid

    if (transition && row.notify && !isCurrentTicket) {
      const topic = topicByUser.get(row.userId)
      if (!topic) {
        log.warn('no ntfy topic, skipping notify', { userId: row.userId, optionId: row.optionId })
      } else {
        const label = CAPACITY_LABELS[row.measurementUnit]?.et ?? row.measurementUnit
        const title = `${dir} ${date} ${formatTime(row.eventDtstart)}`
        const msg =
          transition === 'opened'
            ? `${label}: ${capacity} kohta vaba`
            : `${label}: kinni`
        try {
          await getNotifier().send({
            userId: row.userId,
            userTopic: topic,
            title,
            message: msg,
            tag: 'ferry',
          })
          log.info('notified', {
            userId: row.userId,
            tripId: row.tripId,
            transition,
            capacity,
            priority: row.priority,
          })
          await logAudit({
            type: 'notification.availability_changed',
            actor: 'system',
            userId: row.userId,
            tripId: row.tripId,
            payload: {
              eventUid: row.eventUid,
              from: prevState,
              to: nextState,
              capacity,
              priority: row.priority,
            },
          })
        } catch (err) {
          log.error('notify failed', {
            optionId: row.optionId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    await db
      .update(tripOptions)
      .set({ lastCapacity: capacity, lastCapacityState: nextState })
      .where(eq(tripOptions.id, row.optionId))
  }
}

async function tick() {
  const now = new Date()
  const rows = await db
    .select({
      optionId: tripOptions.id,
      tripId: trips.id,
      userId: trips.userId,
      direction: trips.direction,
      measurementUnit: trips.measurementUnit,
      notify: trips.notify,
      edit: trips.edit,
      stopBeforeAt: tripOptions.stopBeforeAt,
      priority: tripOptions.priority,
      eventUid: tripOptions.eventUid,
      eventDate: tripOptions.eventDate,
      eventDtstart: tripOptions.eventDtstart,
      lastCapacity: tripOptions.lastCapacity,
      lastCapacityState: tripOptions.lastCapacityState,
      currentTicketEventUid: tickets.eventUid,
    })
    .from(trips)
    .innerJoin(tripOptions, eq(tripOptions.tripId, trips.id))
    .leftJoin(tickets, eq(tickets.tripId, trips.id))
    .where(gt(tripOptions.eventDtstart, now))

  const due = rows.filter((r) => r.stopBeforeAt.getTime() > now.getTime())
  if (due.length === 0) return

  const userIds = Array.from(new Set(due.map((r) => r.userId)))
  const users = userIds.length
    ? await db
        .select({ id: user.id, ntfyTopic: user.ntfyTopic })
        .from(user)
        .where(inArray(user.id, userIds))
    : []
  const topicByUser = new Map(users.map((u) => [u.id, u.ntfyTopic]))

  const { pollTimeShift } = await getAllSettings()
  const batches = new Map<string, JoinedOption[]>()
  for (const r of due) {
    const key = `${r.direction}|${r.eventDate}`
    const list = batches.get(key) ?? []
    list.push(r)
    batches.set(key, list)
  }

  for (const [key, batch] of batches) {
    const [dir, date] = key.split('|') as [string, string]
    await processBatch(dir, date, batch, topicByUser, pollTimeShift)
  }

  const editTripIds = new Set<string>()
  const userByTrip = new Map<string, string>()
  for (const r of due) {
    if (!r.edit) continue
    if (r.currentTicketEventUid === r.eventUid) continue
    if (r.lastCapacityState !== 'above') continue
    if ((r.lastCapacity ?? 0) < 1) continue
    editTripIds.add(r.tripId)
    userByTrip.set(r.tripId, r.userId)
  }
  for (const tripId of editTripIds) {
    try {
      const outcome = await processEditForTrip(tripId)
      if (outcome.kind === 'succeeded') {
        const userId = userByTrip.get(tripId)
        const topic = userId ? topicByUser.get(userId) : null
        if (topic) {
          try {
            await getNotifier().send({
              userId: userId!,
              userTopic: topic,
              title: 'Pilet uuendatud',
              message: `Uus pilet ${outcome.newTicketNumber} (arve ${outcome.invoiceNumber})`,
              tag: 'ferry',
            })
          } catch (err) {
            log.error('edit notify failed', {
              tripId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    } catch (err) {
      log.error('processEditForTrip threw', {
        tripId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function loop() {
  while (!stopRequested) {
    const started = Date.now()
    try {
      await tick()
    } catch (err) {
      log.error('tick failed', { error: err instanceof Error ? err.message : String(err) })
    }
    const { pollIntervalMs } = await getAllSettings()
    const elapsed = Date.now() - started
    const delay = Math.max(1000, pollIntervalMs - elapsed)
    log.debug('tick complete', { elapsedMs: elapsed, nextDelayMs: delay })
    await new Promise((r) => setTimeout(r, delay))
  }
}

export function startPoller() {
  if (running) return
  running = true
  stopRequested = false
  log.info('starting')
  loop().catch((err) => {
    log.error('loop crashed', { error: err instanceof Error ? err.message : String(err) })
    running = false
  })
}

export function stopPoller() {
  stopRequested = true
}

import 'server-only'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { tickets, tripOptions, trips, user } from '@/db/schema'
import { CAPACITY_LABELS, listEvents, type PraamidEvent } from '@/lib/praamid'
import { getNotifier } from '@/lib/notifier'
import { getAllSettings } from '@/lib/settings'
import { logAudit } from '@/lib/audit'

let running = false
let stopRequested = false

type JoinedOption = {
  optionId: string
  tripId: string
  userId: string
  direction: string
  measurementUnit: string
  threshold: number
  notify: boolean
  stopBeforeMinutes: number
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
    console.error(`[poller] listEvents ${dir} ${date} failed:`, err)
    await logAudit({
      type: 'system.poller_tick_error',
      actor: 'system',
      payload: { error: err instanceof Error ? err.message : String(err) },
    })
    return
  }

  const eventByUid = new Map(events.map((e) => [e.uid, e]))

  for (const row of rows) {
    const event = eventByUid.get(row.eventUid)
    if (!event) continue
    const capacity = event.capacities?.[row.measurementUnit] ?? 0
    const nextState: 'above' | 'below' = capacity >= row.threshold ? 'above' : 'below'
    const prevState = row.lastCapacityState as 'above' | 'below' | null

    const crossedUp = nextState === 'above' && prevState !== 'above'
    const isCurrentTicket = row.currentTicketEventUid === row.eventUid

    if (crossedUp && row.notify && !isCurrentTicket) {
      const topic = topicByUser.get(row.userId)
      if (!topic) {
        console.warn(`[poller] no ntfy topic for user ${row.userId}, skipping`)
      } else {
        const label = CAPACITY_LABELS[row.measurementUnit]?.et ?? row.measurementUnit
        const title = `${dir} ${date} ${formatTime(row.eventDtstart)}`
        const msg = `${label}: ${capacity} kohta vaba (lävi ${row.threshold})`
        try {
          await getNotifier().send({
            userId: row.userId,
            userTopic: topic,
            title,
            message: msg,
            tag: 'ferry',
          })
          await logAudit({
            type: 'notification.threshold_crossed',
            actor: 'system',
            userId: row.userId,
            tripId: row.tripId,
            payload: {
              eventUid: row.eventUid,
              from: prevState,
              to: 'above',
              capacity,
              threshold: row.threshold,
              priority: row.priority,
            },
          })
        } catch (err) {
          console.error(`[poller] notify failed for option ${row.optionId}:`, err)
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
      threshold: trips.threshold,
      notify: trips.notify,
      stopBeforeMinutes: trips.stopBeforeMinutes,
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
    .where(
      and(
        eq(trips.active, true),
        eq(tripOptions.active, true),
        gt(tripOptions.eventDtstart, now),
      ),
    )
    .all()

  const due = rows.filter(
    (r) => r.eventDtstart.getTime() - now.getTime() > r.stopBeforeMinutes * 60_000,
  )
  if (due.length === 0) return

  const userIds = Array.from(new Set(due.map((r) => r.userId)))
  const users = userIds.length
    ? await db
        .select({ id: user.id, ntfyTopic: user.ntfyTopic })
        .from(user)
        .where(inArray(user.id, userIds))
        .all()
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
}

async function loop() {
  while (!stopRequested) {
    const started = Date.now()
    try {
      await tick()
    } catch (err) {
      console.error('[poller] tick failed:', err)
    }
    const { pollIntervalMs } = await getAllSettings()
    const elapsed = Date.now() - started
    const delay = Math.max(1000, pollIntervalMs - elapsed)
    await new Promise((r) => setTimeout(r, delay))
  }
}

export function startPoller() {
  if (running) return
  running = true
  stopRequested = false
  console.log('[poller] starting')
  loop().catch((err) => {
    console.error('[poller] loop crashed:', err)
    running = false
  })
}

export function stopPoller() {
  stopRequested = true
}

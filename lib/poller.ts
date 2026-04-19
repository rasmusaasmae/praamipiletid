import 'server-only'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { subscriptions, user } from '@/db/schema'
import { CAPACITY_LABELS, listEvents, type PraamidEvent } from '@/lib/praamid'
import { getNotifier } from '@/lib/notifier'
import { getAllSettings } from '@/lib/settings'

let running = false
let stopRequested = false

type SubRow = typeof subscriptions.$inferSelect

function formatTime(date: Date) {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

async function processBatch(dir: string, date: string, subs: SubRow[], timeShift: number) {
  let events: PraamidEvent[]
  try {
    events = await listEvents(dir, date, timeShift)
  } catch (err) {
    console.error(`[poller] listEvents ${dir} ${date} failed:`, err)
    return
  }

  const eventByUid = new Map(events.map((e) => [e.uid, e]))
  const userIds = Array.from(new Set(subs.map((s) => s.userId)))
  const users = userIds.length
    ? await db
        .select({ id: user.id, ntfyTopic: user.ntfyTopic })
        .from(user)
        .where(inArray(user.id, userIds))
        .all()
    : []
  const topicByUser = new Map(users.map((u) => [u.id, u.ntfyTopic]))

  for (const sub of subs) {
    const event = eventByUid.get(sub.tripUid)
    if (!event) continue
    const capacity = event.capacities?.[sub.capacityType] ?? 0
    const prev = sub.lastCapacity
    const meetsThreshold = capacity >= sub.threshold

    let shouldNotify = false
    if (sub.renotifyMode === 'every_cycle') {
      shouldNotify = meetsThreshold
    } else if (sub.renotifyMode === 'on_change') {
      shouldNotify = meetsThreshold && capacity !== prev
    } else {
      // once_until_depleted (default)
      const wasDepleted = prev == null || prev < sub.threshold
      shouldNotify = meetsThreshold && wasDepleted
    }

    if (shouldNotify) {
      const topic = topicByUser.get(sub.userId)
      if (!topic) {
        console.warn(`[poller] no ntfy topic for user ${sub.userId}, skipping`)
      } else {
        const depart = new Date(event.dtstart)
        const label = CAPACITY_LABELS[sub.capacityType]?.et ?? sub.capacityType
        const title = `${dir} ${date} ${formatTime(depart)}`
        const msg = `${label}: ${capacity} kohta vaba (lävi ${sub.threshold})`
        try {
          await getNotifier().send({
            userId: sub.userId,
            userTopic: topic,
            title,
            message: msg,
            tag: 'ferry',
          })
        } catch (err) {
          console.error(`[poller] notify failed for sub ${sub.id}:`, err)
        }
      }
    }

    await db
      .update(subscriptions)
      .set({
        lastCapacity: capacity,
        lastNotifiedAt: shouldNotify ? new Date() : sub.lastNotifiedAt,
      })
      .where(eq(subscriptions.id, sub.id))
  }
}

async function tick() {
  const now = new Date()
  const active = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.active, true), gt(subscriptions.departureAt, now)))
    .all()

  if (active.length === 0) return

  const { pollTimeShift } = await getAllSettings()
  const batches = new Map<string, SubRow[]>()
  for (const sub of active) {
    const key = `${sub.direction}|${sub.date}`
    const list = batches.get(key) ?? []
    list.push(sub)
    batches.set(key, list)
  }

  for (const [key, subs] of batches) {
    const [dir, date] = key.split('|') as [string, string]
    await processBatch(dir, date, subs, pollTimeShift)
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

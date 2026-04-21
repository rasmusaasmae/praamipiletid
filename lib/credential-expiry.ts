import 'server-only'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { auditLogs, user } from '@/db/schema'
import { listCredentialsNeedingReauth } from '@/lib/praamid-credentials'
import { getNotifier } from '@/lib/notifier'
import { logAudit } from '@/lib/audit'
import { createLogger } from '@/lib/logger'

const log = createLogger('credential-expiry')

const WARN_HOURS = 48
const DEDUPE_HOURS = 20
const TICK_INTERVAL_MS = 60 * 60 * 1000

let running = false

async function recentlyNotified(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000)
  const [row] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, userId),
        eq(auditLogs.type, 'notification.credential_expiring'),
        gt(auditLogs.createdAt, cutoff),
      ),
    )
    .limit(1)
  return Boolean(row)
}

async function tick() {
  const candidates = await listCredentialsNeedingReauth(WARN_HOURS)
  if (candidates.length === 0) return
  const now = Date.now()
  const upcoming = candidates.filter((c) => c.expiresAt.getTime() > now)
  if (upcoming.length === 0) return

  const userIds = Array.from(new Set(upcoming.map((c) => c.userId)))
  const userRows = await db
    .select({ id: user.id, ntfyTopic: user.ntfyTopic })
    .from(user)
    .where(inArray(user.id, userIds))
  const topicByUser = new Map(userRows.map((u) => [u.id, u.ntfyTopic]))

  for (const c of upcoming) {
    const topic = topicByUser.get(c.userId)
    if (!topic) continue
    if (await recentlyNotified(c.userId)) continue

    const hoursLeft = Math.max(0, Math.round((c.expiresAt.getTime() - now) / (60 * 60 * 1000)))
    try {
      await getNotifier().send({
        userId: c.userId,
        userTopic: topic,
        title: 'praamid sessioon aegumas',
        message: `Sinu praamid.ee sessioon aegub ${hoursLeft}h pärast — salvesta uus.`,
        tag: 'warning',
      })
      await logAudit({
        type: 'notification.credential_expiring',
        actor: 'system',
        userId: c.userId,
        payload: { expiresAt: c.expiresAt.toISOString(), hoursLeft },
      })
    } catch (err) {
      log.error('notify failed', {
        userId: c.userId,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function loop() {
  while (true) {
    try {
      await tick()
    } catch (err) {
      log.error('tick failed', { err: err instanceof Error ? err.message : String(err) })
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS))
  }
}

export function startCredentialExpiryWatcher() {
  if (running) return
  running = true
  log.info('starting')
  loop().catch((err) => {
    log.error('loop crashed', { err: err instanceof Error ? err.message : String(err) })
    running = false
  })
}

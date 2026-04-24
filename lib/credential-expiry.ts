import 'server-only'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { auditLogs } from '@/db/schema'
import { listCredentialsNeedingReauth } from '@/lib/praamid-credentials'
import { sendEmail } from '@/lib/email'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'credential-expiry' })

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
  const upcoming = await listCredentialsNeedingReauth(WARN_HOURS)
  if (upcoming.length === 0) return
  const now = Date.now()

  for (const c of upcoming) {
    if (await recentlyNotified(c.userId)) continue
    const hoursLeft = Math.max(0, Math.round((c.expiresAt.getTime() - now) / (60 * 60 * 1000)))
    try {
      await sendEmail({
        userId: c.userId,
        subject: 'praamid.ee session expiring',
        body: `Your praamid.ee session expires in ${hoursLeft}h — re-authenticate to keep auto-swap working.`,
      })
      await logAudit({
        type: 'notification.credential_expiring',
        actor: 'system',
        userId: c.userId,
        payload: { expiresAt: c.expiresAt.toISOString(), hoursLeft },
      })
    } catch (err) {
      log.error(
        {
          userId: c.userId,
          err: err instanceof Error ? err.message : String(err),
        },
        'notify failed',
      )
    }
  }
}

async function loop() {
  while (true) {
    try {
      await tick()
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'tick failed')
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS))
  }
}

export function startCredentialExpiryWatcher() {
  if (running) return
  running = true
  log.info('starting')
  loop().catch((err) => {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'loop crashed')
    running = false
  })
}

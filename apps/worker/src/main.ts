import { createDb } from '@praamipiletid/db'
import { logger } from '@praamipiletid/logger'
import { createPraamidee, LOGIN_CHANNEL, type LoginRequest } from '@praamipiletid/praamidee'
import { createLoginBot } from '@praamipiletid/praamidee/bot'

import { createSmtpMailer } from './mailer'
import { createWorker } from './worker'

const log = logger.child({ scope: 'worker' })

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const CYCLE_EVERY_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS ?? 10_000))
const CLEANUP_EVERY_MS = 10 * 60_000

const databaseUrl = env('DATABASE_URL')
const db = createDb(databaseUrl)
const praamidee = createPraamidee({ db, credKey: env('PRAAMID_CRED_KEY') })

const worker = await createWorker({
  db,
  praamid: praamidee.praamid,
  mailer: createSmtpMailer({
    host: env('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT ?? 587),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM'),
  }),
  databaseUrl,
})

// Logins in flight died with the previous process.
await praamidee.state.settleAbandoned()

const bot = createLoginBot({
  credentials: praamidee.credentials,
  tokens: praamidee.tokens,
  state: praamidee.state,
  onError: (userId, err) => log.warn({ userId, err }, 'praamid login failed'),
})

// The API hands login requests over through Postgres; the browser lives here.
const listener = await db.client.listen(LOGIN_CHANNEL, (payload) => {
  const request = JSON.parse(payload) as LoginRequest
  const run =
    request.action === 'start'
      ? bot.start(request.userId, request.isikukood)
      : bot.cancel(request.userId)
  run.catch((err: unknown) =>
    log.error({ userId: request.userId, err: String(err) }, `login ${request.action} failed`),
  )
})

let stopping = false
let lastCleanup = 0

async function loop() {
  while (!stopping) {
    const started = Date.now()
    try {
      if (started - lastCleanup > CLEANUP_EVERY_MS) {
        lastCleanup = started
        const removed = await praamidee.credentials.removeExpired()
        if (removed > 0) log.info({ removed }, 'expired praamid.ee logins removed')
      }
      await worker.runCycle(new Date())
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'cycle failed')
    }
    await Bun.sleep(Math.max(1000, CYCLE_EVERY_MS - (Date.now() - started)))
  }
}

async function shutdown(signal: string) {
  log.info({ signal }, 'stopping')
  stopping = true
  await listener.unlisten()
  await bot.close()
  await worker.shutdown()
  await db.client.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

log.info({ everyMs: CYCLE_EVERY_MS }, 'started')
await loop()

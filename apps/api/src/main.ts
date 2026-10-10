import { createDb, runMigrations } from '@praamipiletid/db'
import { logger } from '@praamipiletid/logger'
import { createPraamidee } from '@praamipiletid/praamidee'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

import { createApp } from './app'
import { createAuth } from './auth'

const log = logger.child({ scope: 'api' })

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const db = createDb(env('DATABASE_URL'))
await runMigrations(db)

const praamidee = createPraamidee({ db, credKey: env('PRAAMID_CRED_KEY') })
const auth = createAuth({
  db,
  baseURL: env('APP_URL'),
  secret: env('BETTER_AUTH_SECRET'),
  pocketId: {
    url: env('POCKET_ID_URL'),
    clientId: env('POCKET_ID_CLIENT_ID'),
    clientSecret: env('POCKET_ID_CLIENT_SECRET'),
  },
})

// The built web app, served from the same origin so the session cookie
// needs no cross-site setup.
const webDist = process.env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname

const server = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  .all('/api/auth/*', (c) => auth.handler(c.req.raw))
  .route(
    '/',
    createApp({
      db,
      praamid: praamidee.praamid,
      praamidee,
      userIdFrom: async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null,
    }),
  )
  .all('/api/*', (c) => c.json({ error: 'not_found' }, 404))
  .use('/*', serveStatic({ root: webDist }))
  // Client-side routes all load the same page.
  .get('*', async (c) => c.html(await Bun.file(`${webDist}/index.html`).text()))

const port = Number(process.env.PORT ?? 3000)
Bun.serve({
  port,
  fetch: server.fetch,
  // Event streams stay open; the stream pings well within this.
  idleTimeout: 60,
})
log.info({ port }, 'listening')

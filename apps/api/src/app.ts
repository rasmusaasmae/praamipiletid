import { zValidator } from '@hono/zod-validator'
import { createTickets, TicketsError } from '@praamipiletid/core'
import type { Db } from '@praamipiletid/db'
import {
  LOGIN_CHANNEL,
  type LoginRequest,
  type Praamid,
  type Praamidee,
} from '@praamipiletid/praamidee'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { createChangeFeed } from './changes'

export type AppDeps = {
  db: Db
  praamid: Praamid
  praamidee: Pick<Praamidee, 'login'>
  // The signed-in user for a request, or null.
  userIdFrom: (headers: Headers) => Promise<string | null>
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function createApp(deps: AppDeps) {
  const tickets = createTickets(deps)
  const { login } = deps.praamidee
  const changes = createChangeFeed(deps.db)

  // The worker owns the browser that drives the praamid.ee login.
  async function toWorker(request: LoginRequest) {
    await deps.db.client.notify(LOGIN_CHANNEL, JSON.stringify(request))
  }

  const signedIn = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
    const userId = await deps.userIdFrom(c.req.raw.headers)
    if (!userId) return c.json({ error: 'unauthenticated' }, 401)
    c.set('userId', userId)
    await next()
  })

  const api = new Hono()
    .use(signedIn)
    .get('/tickets', async (c) => c.json(await tickets.list(c.var.userId)))
    // Server-sent events: `changed` whenever the user's tickets or praamid.ee
    // login change, so the page knows to refetch.
    .get('/events', (c) =>
      streamSSE(c, async (stream) => {
        const unsubscribe = await changes.subscribe(c.var.userId, () => {
          void stream.writeSSE({ event: 'changed', data: '' })
        })
        stream.onAbort(unsubscribe)
        // Anything that changes from here on is announced.
        await stream.writeSSE({ event: 'ready', data: '' })
        while (!stream.aborted) await stream.sleep(25_000).then(() => stream.write(': ping\n\n'))
      }),
    )
    .get(
      '/tickets/:ticketId/departures',
      zValidator('param', z.object({ ticketId: z.coerce.number().int().positive() })),
      zValidator('query', z.object({ date })),
      async (c) =>
        c.json(
          await tickets.departures(
            c.var.userId,
            c.req.valid('param').ticketId,
            c.req.valid('query').date,
          ),
        ),
    )
    .post(
      '/tickets/:ticketId/options',
      zValidator('param', z.object({ ticketId: z.coerce.number().int().positive() })),
      zValidator(
        'json',
        z.object({
          eventUid: z.string().min(1),
          date,
          stopBeforeMinutes: z.number().int().min(0).optional(),
        }),
      ),
      async (c) => {
        const option = await tickets.addOption(c.var.userId, {
          ticketId: c.req.valid('param').ticketId,
          ...c.req.valid('json'),
        })
        return c.json(option, 201)
      },
    )
    .patch(
      '/options/:id',
      zValidator('json', z.object({ stopBeforeMinutes: z.number().int().min(0) })),
      async (c) => {
        await tickets.setCutoff(
          c.var.userId,
          c.req.param('id'),
          c.req.valid('json').stopBeforeMinutes,
        )
        return c.body(null, 204)
      },
    )
    .post(
      '/options/:id/move',
      zValidator('json', z.object({ direction: z.enum(['up', 'down']) })),
      async (c) => {
        await tickets.moveOption(c.var.userId, c.req.param('id'), c.req.valid('json').direction)
        return c.body(null, 204)
      },
    )
    .delete('/options/:id', async (c) => {
      await tickets.removeOption(c.var.userId, c.req.param('id'))
      return c.body(null, 204)
    })
    .get('/praamid/login', async (c) => c.json(await login.info(c.var.userId)))
    .post(
      '/praamid/login',
      zValidator('json', z.object({ isikukood: z.string().regex(/^\d{11}$/) })),
      async (c) => {
        await login.markLoading(c.var.userId)
        await toWorker({
          action: 'start',
          userId: c.var.userId,
          isikukood: c.req.valid('json').isikukood,
        })
        return c.body(null, 202)
      },
    )
    .post('/praamid/login/cancel', async (c) => {
      await toWorker({ action: 'cancel', userId: c.var.userId })
      // Settle right away too, in case no worker is running to do it.
      await login.settle(c.var.userId)
      return c.body(null, 202)
    })
    .delete('/praamid/login', async (c) => {
      await login.forget(c.var.userId)
      return c.body(null, 204)
    })

  return new Hono()
    .onError((err, c) => {
      if (err instanceof TicketsError) {
        const status = err.code.endsWith('not_found') ? 404 : 409
        return c.json({ error: err.code }, status)
      }
      throw err
    })
    .route('/api', api)
}

export type App = ReturnType<typeof createApp>

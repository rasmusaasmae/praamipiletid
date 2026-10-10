import { beforeEach, expect, test } from 'bun:test'

import { createUser, getTestDb, resetDb, seedTicket } from '@praamipiletid/db/testing'
import { createPraamidee } from '@praamipiletid/praamidee'
import { createFakePraamid, type FakePraamid } from '@praamipiletid/praamidee/fake'

import { createApp } from '../src/app'

const DAY = '2026-10-17'
const CRED_KEY = '00'.repeat(32)
const db = await getTestDb()
let praamid: FakePraamid
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  await resetDb(db)
  praamid = createFakePraamid()
  app = createApp({
    db,
    praamid: praamid.praamid,
    praamidee: createPraamidee({ db, credKey: CRED_KEY }),
    // Stands in for the signed-in session: the user id travels in a header.
    userIdFrom: async (headers) => headers.get('x-test-user'),
  })
  for (const [uid, hhmm] of [
    ['vk-1530', '15:30'],
    ['vk-1630', '16:30'],
    ['vk-1800', '18:00'],
  ] as const) {
    praamid.addDeparture({
      uid,
      direction: 'VK',
      date: DAY,
      dtstart: `${DAY}T${hhmm}:00+03:00`,
      free: { sv: 0 },
    })
  }
  await createUser(db, 'u1')
  await seedTicket(db, {
    id: 1,
    userId: 'u1',
    eventUid: 'vk-1800',
    dtstart: `${DAY}T18:00:00+03:00`,
  })
})

function call(userId: string | null, method: string, path: string, body?: unknown) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (userId) headers.set('x-test-user', userId)
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function options(userId = 'u1') {
  const res = await call(userId, 'GET', '/api/tickets')
  const list = (await res.json()) as {
    ticket: { id: number }
    options: { id: string; eventUid: string; priority: number; stopBeforeMinutes: number }[]
  }[]
  return list[0]?.options ?? []
}

test('adds a new option at the bottom of the list with a 60-minute cutoff', async () => {
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1530', date: DAY })

  expect(await options()).toMatchObject([
    { eventUid: 'vk-1630', priority: 1, stopBeforeMinutes: 60 },
    { eventUid: 'vk-1530', priority: 2, stopBeforeMinutes: 60 },
  ])
})

test('rejects the ticket’s current departure as an option', async () => {
  const res = await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1800', date: DAY })

  expect(res.status).toBe(409)
  expect(await options()).toEqual([])
})

test('rejects the same departure twice', async () => {
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  const res = await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })

  expect(res.status).toBe(409)
  expect(await options()).toHaveLength(1)
})

test('keeps each user’s tickets private', async () => {
  await createUser(db, 'u2')

  const list = await call('u2', 'GET', '/api/tickets')
  const add = await call('u2', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })

  expect(await list.json()).toEqual([])
  expect(add.status).toBe(404)
  expect(await options('u1')).toEqual([])
})

test('requires sign-in', async () => {
  const res = await call(null, 'GET', '/api/tickets')

  expect(res.status).toBe(401)
})

test('moving an option up swaps its place with the one above', async () => {
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1530', date: DAY })
  const [, second] = await options()

  await call('u1', 'POST', `/api/options/${second!.id}/move`, { direction: 'up' })

  expect((await options()).map((o) => [o.eventUid, o.priority])).toEqual([
    ['vk-1530', 1],
    ['vk-1630', 2],
  ])
})

test('changes an option’s cutoff', async () => {
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  const [option] = await options()

  await call('u1', 'PATCH', `/api/options/${option!.id}`, { stopBeforeMinutes: 120 })

  expect((await options())[0]!.stopBeforeMinutes).toBe(120)
})

test('cannot change, move or remove another user’s option', async () => {
  await createUser(db, 'u2')
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1530', date: DAY })
  const before = await options()
  const id = before[1]!.id

  const responses = [
    await call('u2', 'PATCH', `/api/options/${id}`, { stopBeforeMinutes: 5 }),
    await call('u2', 'POST', `/api/options/${id}/move`, { direction: 'up' }),
    await call('u2', 'DELETE', `/api/options/${id}`),
  ]

  expect(responses.map((r) => r.status)).toEqual([404, 404, 404])
  expect(await options()).toEqual(before)
})

test('removes an option', async () => {
  await call('u1', 'POST', '/api/tickets/1/options', { eventUid: 'vk-1630', date: DAY })
  const [option] = await options()

  await call('u1', 'DELETE', `/api/options/${option!.id}`)

  expect(await options()).toEqual([])
})

async function loginStatus(userId = 'u1') {
  const res = await call(userId, 'GET', '/api/praamid/login')
  return ((await res.json()) as { status: string }).status
}

test('starting a praamid.ee login shows it as in progress', async () => {
  const res = await call('u1', 'POST', '/api/praamid/login', { isikukood: '38001010000' })

  expect(res.status).toBe(202)
  expect(await loginStatus()).toBe('loading')
})

test('rejects an isikukood that is not 11 digits', async () => {
  const res = await call('u1', 'POST', '/api/praamid/login', { isikukood: '3800101' })

  expect(res.status).toBe(400)
  expect(await loginStatus()).toBe('unauthenticated')
})

test('forgets a stored praamid.ee login', async () => {
  const jwt = (claims: object) =>
    ['{}', JSON.stringify(claims)].map((p) => Buffer.from(p).toString('base64url')).join('.') +
    '.sig'
  const praamidee = createPraamidee({ db, credKey: CRED_KEY })
  await praamidee.credentials.save('u1', {
    accessToken: jwt({ sub: 'praamid-sub' }),
    refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  })
  await praamidee.state.set('u1', 'authenticated')
  expect(await loginStatus()).toBe('authenticated')

  await call('u1', 'DELETE', '/api/praamid/login')

  expect(await loginStatus()).toBe('unauthenticated')
  expect(await praamidee.credentials.exists('u1')).toBe(false)
})

test('lists the day’s departures in the ticket’s direction', async () => {
  praamid.addDeparture({
    uid: 'kv-1700',
    direction: 'KV',
    date: DAY,
    dtstart: `${DAY}T17:00:00+03:00`,
  })

  const res = await call('u1', 'GET', `/api/tickets/1/departures?date=${DAY}`)

  const uids = ((await res.json()) as { uid: string }[]).map((e) => e.uid)
  expect(uids).toEqual(['vk-1530', 'vk-1630', 'vk-1800'])
})

test('tells the user’s open pages when their data changes', async () => {
  const res = await call('u1', 'GET', '/api/events')
  const reader = res.body!.getReader()
  await reader.read() // the stream's opening comment

  await createPraamidee({ db, credKey: CRED_KEY }).state.set('u1', 'awaiting_confirmation')

  const next = await Promise.race([
    reader.read(),
    Bun.sleep(2000).then(() => ({ value: undefined })),
  ])
  await reader.cancel()
  expect(new TextDecoder().decode(next.value)).toContain('event: changed')
})

test('asks reverse proxies not to hold back the change stream', async () => {
  const res = await call('u1', 'GET', '/api/events')
  await res.body!.cancel()

  // nginx buffers responses unless told otherwise, and a buffered event
  // stream never reaches the page.
  expect(res.headers.get('x-accel-buffering')).toBe('no')
})

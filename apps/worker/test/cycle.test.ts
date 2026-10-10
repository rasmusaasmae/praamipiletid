import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'

import { createTickets } from '@praamipiletid/core'
import { createUser, getTestDb, resetDb, testDatabaseUrl } from '@praamipiletid/db/testing'
import { createFakePraamid, type FakePraamid } from '@praamipiletid/praamidee/fake'

import { createWorker, type Worker } from '../src/worker'

const DAY = '2026-10-17'
// Clock times on the departure day, Estonian summer time.
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+03:00`)

const db = await getTestDb()
let praamid: FakePraamid
let worker: Worker
const tickets = () => createTickets({ db, praamid: praamid.praamid })

beforeAll(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await worker?.shutdown()
  await resetDb(db)
  praamid = createFakePraamid()
  worker = await createWorker({ db, praamid: praamid.praamid, databaseUrl: testDatabaseUrl })
})

afterAll(async () => {
  await worker?.shutdown()
})

// One worker cycle at `now`, waiting for any swap it starts to finish.
async function cycle(now: Date) {
  await worker.runCycle(now)
  await worker.drain()
}

// A user with a 18:00 Virtsu → Kuivastu car ticket and a praamid.ee login,
// whose tickets the worker has already picked up.
async function userWithTicket(userId = 'u1') {
  await createUser(db, userId)
  praamid.login(userId, new Date(`${DAY}T23:59:00+03:00`))
  praamid.addDeparture({
    uid: 'vk-1800',
    direction: 'VK',
    date: DAY,
    dtstart: `${DAY}T18:00:00+03:00`,
    free: { sv: 5 },
  })
  praamid.book(userId, 'vk-1800')
  await cycle(at('12:00'))
  const [current] = await tickets().list(userId)
  return current!.ticket
}

function departure(uid: string, hhmm: string, free: number) {
  praamid.addDeparture({
    uid,
    direction: 'VK',
    date: DAY,
    dtstart: `${DAY}T${hhmm}:00+03:00`,
    free: { sv: free },
  })
}

test('swaps a ticket to a higher-priority departure when it opens up', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 0)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  praamid.setFree('vk-1630', { sv: 2 })
  await cycle(at('12:40'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1630')
})

test('never pays: keeps the ticket when the better departure costs more', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 2)
  praamid.setPrice('vk-1630', 4.5)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  await cycle(at('12:40'))

  expect(praamid.owed('u1')).toBe(0)
  expect(praamid.activeTickets('u1').map((t) => t.event.uid)).toEqual(['vk-1800'])
  expect(praamid.pendingEdits()).toEqual([])
})

test('does not swap to a departure past its cutoff', async () => {
  const ticket = await userWithTicket()
  departure('vk-1500', '15:00', 3)
  await tickets().addOption('u1', {
    ticketId: ticket.id,
    eventUid: 'vk-1500',
    date: DAY,
    stopBeforeMinutes: 60,
  })

  await cycle(at('14:10'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1800')
})

test('picks the most wanted of several open options', async () => {
  const ticket = await userWithTicket()
  departure('vk-1530', '15:30', 1)
  departure('vk-1630', '16:30', 1)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1530', date: DAY })

  await cycle(at('12:40'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1630')
})

test('never moves a ticket to a less wanted option after a swap', async () => {
  const ticket = await userWithTicket()
  departure('vk-1530', '15:30', 0)
  departure('vk-1630', '16:30', 1)
  departure('vk-1700', '17:00', 0)
  for (const uid of ['vk-1530', 'vk-1630', 'vk-1700']) {
    await tickets().addOption('u1', { ticketId: ticket.id, eventUid: uid, date: DAY })
  }
  await cycle(at('12:40'))

  praamid.setFree('vk-1700', { sv: 4 })
  await cycle(at('12:41'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1630')
  expect(after!.options.map((o) => o.eventUid)).toEqual(['vk-1530'])
})

test('does not swap to a departure without room for the ticket’s vehicle', async () => {
  const ticket = await userWithTicket()
  praamid.addDeparture({
    uid: 'vk-1630',
    direction: 'VK',
    date: DAY,
    dtstart: `${DAY}T16:30:00+03:00`,
    free: { pcs: 40, sv: 0 },
  })
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  await cycle(at('12:40'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1800')
})

test('does not start a swap when the praamid.ee login expires within 15 minutes', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 2)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })
  praamid.login('u1', at('12:49'))

  await cycle(at('12:40'))

  expect(praamid.activeTickets('u1').map((t) => t.event.uid)).toEqual(['vk-1800'])
  expect(praamid.pendingEdits()).toEqual([])
})

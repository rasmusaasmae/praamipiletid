import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'

import { createTickets } from '@praamipiletid/core'
import { createUser, getTestDb, resetDb, testDatabaseUrl } from '@praamipiletid/db/testing'
import { createFakePraamid, type FakePraamid } from '@praamipiletid/praamidee/fake'

import { createFakeMailer } from '../src/mailer'
import { createWorker, type Worker } from '../src/worker'

const DAY = '2026-10-17'
// Clock times on the departure day, Estonian summer time.
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+03:00`)

const db = await getTestDb()
let praamid: FakePraamid
let worker: Worker
let mailer: ReturnType<typeof createFakeMailer>
const tickets = () => createTickets({ db, praamid: praamid.praamid })

beforeAll(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await worker?.shutdown()
  await resetDb(db)
  praamid = createFakePraamid()
  mailer = createFakeMailer()
  worker = await createWorker({
    db,
    praamid: praamid.praamid,
    mailer,
    databaseUrl: testDatabaseUrl,
    logLevel: 'error',
  })
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
  expect(mailer.sent).toEqual([])
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

test('retries a failed swap after 10 minutes, not on the next cycle', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 2)
  praamid.setPrice('vk-1630', 4.5)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })
  await cycle(at('12:40'))

  praamid.setPrice('vk-1630', 0)
  await cycle(at('12:45'))
  const [waiting] = await tickets().list('u1')
  expect(waiting!.ticket.eventUid).toBe('vk-1800')

  await cycle(at('12:51'))
  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1630')
})

test('forgets a ticket the user cancelled on praamid.ee', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 0)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  praamid.cancel(ticket.id)
  await cycle(at('12:10'))

  expect(await tickets().list('u1')).toEqual([])
})

test('uses the departure time praamid.ee currently shows for the cutoff', async () => {
  const ticket = await userWithTicket()
  departure('vk-1500', '15:00', 0)
  await tickets().addOption('u1', {
    ticketId: ticket.id,
    eventUid: 'vk-1500',
    date: DAY,
    stopBeforeMinutes: 60,
  })

  praamid.reschedule('vk-1500', `${DAY}T15:30:00+03:00`)
  await cycle(at('13:50'))
  praamid.setFree('vk-1500', { sv: 1 })
  await cycle(at('14:10'))

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1500')
})

test('emails the user when their ticket is moved', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 2)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  await cycle(at('12:40'))

  expect(mailer.sent).toHaveLength(1)
  expect(mailer.sent[0]!.to).toBe('u1@example.com')
  expect(mailer.sent[0]!.text).toContain('from 18:00 to 16:30')
})

test('a committed swap is still synced and emailed after the worker crashes', async () => {
  const ticket = await userWithTicket()
  departure('vk-1630', '16:30', 2)
  await tickets().addOption('u1', { ticketId: ticket.id, eventUid: 'vk-1630', date: DAY })

  // The first thing after the commit is fetching the user's tickets.
  const afterCommit = praamid.hold('tickets')
  void worker.runCycle(at('12:03'))
  await afterCommit.reached
  await worker.shutdown()

  worker = await createWorker({
    db,
    praamid: praamid.praamid,
    mailer,
    databaseUrl: testDatabaseUrl,
    logLevel: 'error',
  })
  await worker.drain()

  const [after] = await tickets().list('u1')
  expect(after!.ticket.eventUid).toBe('vk-1630')
  expect(praamid.activeTickets('u1')).toHaveLength(1)
  expect(mailer.sent).toHaveLength(1)
})

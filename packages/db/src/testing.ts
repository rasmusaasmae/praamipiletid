import { sql } from 'drizzle-orm'

import { createDb, runMigrations, tickets, user, type Db } from './index'

const DEFAULT_TEST_URL = 'postgres://postgres:postgres@localhost:5432/ferry_tickets_test'

export const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL

let shared: Promise<Db> | null = null

// One migrated connection per test process.
export function getTestDb(): Promise<Db> {
  shared ??= (async () => {
    const db = createDb(testDatabaseUrl)
    await runMigrations(db)
    return db
  })()
  return shared
}

// Empties every application table (and DBOS's bookkeeping, when present) so
// each test starts from nothing.
export async function resetDb(db: Db): Promise<void> {
  const rows = await db.execute<{ name: string }>(sql`
    SELECT format('%I.%I', schemaname, tablename) AS name
    FROM pg_tables
    WHERE schemaname IN ('public', 'dbos')
      AND tablename NOT LIKE '%migrations%'
  `)
  if (rows.length === 0) return
  await db.execute(sql.raw(`TRUNCATE ${rows.map((r) => r.name).join(', ')} CASCADE`))
}

// A signed-up app user, as better-auth would create one.
export async function createUser(db: Db, id: string): Promise<void> {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true })
}

// A ticket in our copy, as the worker's sync would have stored it.
export async function seedTicket(
  db: Db,
  t: { id: number; userId: string; eventUid: string; dtstart: string; direction?: string },
): Promise<void> {
  await db.insert(tickets).values({
    id: t.id,
    userId: t.userId,
    bookingUid: `B-${t.id}`,
    bookingReferenceNumber: `R-${t.id}`,
    sequenceNumber: 1,
    ticketCode: `TC-${t.id}`,
    ticketNumber: `T-${t.id}`,
    direction: t.direction ?? 'VK',
    measurementUnit: 'sv',
    eventUid: t.eventUid,
    eventDtstart: new Date(t.dtstart),
    ticketDate: t.dtstart.slice(0, 10),
    capturedAt: new Date(),
  })
}

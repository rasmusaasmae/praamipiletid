import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import * as schema from './schema'

export * from './schema'

export function createDb(url: string) {
  const client = postgres(url, { onnotice: () => {} })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  return Object.assign(db, { client })
}

export type Db = ReturnType<typeof createDb>

// Transaction handle accepted wherever a Db is, for functions that run
// either standalone or inside a caller's transaction.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
}

// Postgres NOTIFY channel carrying the id of a user whose tickets or
// praamid.ee login changed, so open pages can refresh.
export const USER_CHANGED_CHANNEL = 'user_changed'

// Inside a transaction the notification goes out on commit.
export async function notifyUserChanged(db: Db | Tx, userId: string): Promise<void> {
  await db.execute(sql`SELECT pg_notify(${USER_CHANGED_CHANNEL}, ${userId})`)
}

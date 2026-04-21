import 'server-only'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from '@/db'
import { createLogger } from '@/lib/logger'

const log = createLogger('migrate')

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
  } catch (err) {
    log.error('migrate failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

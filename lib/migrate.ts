import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql } from '@/db'
import { createLogger } from '@/lib/logger'

const log = createLogger('migrate')

export async function runMigrations() {
  try {
    await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  } catch (err) {
    log.error('migrate failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

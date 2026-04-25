import 'server-only'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { db } from '@/db'
import { logger } from '@/lib/logger'

const log = logger.child({ scope: 'migrate' })

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'migrate failed')
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { sqlite } = await import('@/db')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  try {
    migrate(drizzle(sqlite), { migrationsFolder: './drizzle' })
  } catch (err) {
    console.error('[instrumentation] migrate failed:', err)
  }

  const { startPoller } = await import('@/lib/poller')
  startPoller()

  const { startCredentialExpiryWatcher } = await import('@/lib/credential-expiry')
  startCredentialExpiryWatcher()
}

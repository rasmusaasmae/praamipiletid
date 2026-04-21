export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { sql } = await import('@/db')
  const { migrate } = await import('drizzle-orm/postgres-js/migrator')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  try {
    await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  } catch (err) {
    console.error('[instrumentation] migrate failed:', err)
  }

  const { startPoller } = await import('@/lib/poller')
  startPoller()

  const { startCredentialExpiryWatcher } = await import('@/lib/credential-expiry')
  startCredentialExpiryWatcher()
}

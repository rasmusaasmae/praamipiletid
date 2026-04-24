export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { runMigrations } = await import('@/lib/migrate')
  await runMigrations()

  const { startPoller } = await import('@/lib/poller')
  startPoller()
}

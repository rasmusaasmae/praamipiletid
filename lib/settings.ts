import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { settings } from '@/db/schema'

const DEFAULTS: Record<string, number> = {
  pollIntervalMs: 15_000,
  pollTimeShift: 300,
  editGloballyEnabled: 0,
}

export type SettingsKey = 'pollIntervalMs' | 'pollTimeShift' | 'editGloballyEnabled'

export async function getSetting(key: SettingsKey): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  if (!row) return DEFAULTS[key]
  const parsed = Number(row.value)
  if (Number.isFinite(parsed)) return parsed
  return DEFAULTS[key]
}

export async function setSetting(key: SettingsKey, value: number): Promise<void> {
  const stringified = String(value)
  await db
    .insert(settings)
    .values({ key, value: stringified })
    .onConflictDoUpdate({ target: settings.key, set: { value: stringified } })
}

export async function getAllSettings() {
  const rows = await db.select().from(settings)
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    pollIntervalMs: Number(map.get('pollIntervalMs') ?? DEFAULTS.pollIntervalMs),
    pollTimeShift: Number(map.get('pollTimeShift') ?? DEFAULTS.pollTimeShift),
    editGloballyEnabled:
      Number(map.get('editGloballyEnabled') ?? DEFAULTS.editGloballyEnabled) !== 0,
  }
}

export { DEFAULTS as SETTINGS_DEFAULTS }

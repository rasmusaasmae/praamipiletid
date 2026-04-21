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

function parseOrDefault(raw: string | undefined, key: SettingsKey): number {
  if (raw === undefined) return DEFAULTS[key]
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULTS[key]
}

export async function getSetting(key: SettingsKey): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return parseOrDefault(row?.value, key)
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
    pollIntervalMs: parseOrDefault(map.get('pollIntervalMs'), 'pollIntervalMs'),
    pollTimeShift: parseOrDefault(map.get('pollTimeShift'), 'pollTimeShift'),
    editGloballyEnabled: parseOrDefault(map.get('editGloballyEnabled'), 'editGloballyEnabled') !== 0,
  }
}

export { DEFAULTS as SETTINGS_DEFAULTS }

import 'server-only'
import { BASE_URL, publicFetch, type ApiList } from './client'
import type { PraamidEvent } from './types'

async function list(direction: string, date: string, timeShift = 300): Promise<PraamidEvent[]> {
  const url = `${BASE_URL}/events?direction=${encodeURIComponent(direction)}&departure-date=${encodeURIComponent(date)}&time-shift=${timeShift}`
  const data = await publicFetch<ApiList<PraamidEvent>>(url)
  return data.items
}

export const event = { list }

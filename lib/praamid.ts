const BASE_URL = 'https://www.praamid.ee/online'

export type Direction = {
  code: string
  name: string
  fromPort: { code: string; name: string }
  toPort: { code: string; name: string }
  reverseDirection: { code: string }
}

export type CapacityUnit = {
  code: string
  name: string
  type: { code: string }
  measurementUnit: { code: string; name: string }
  vehicle: boolean
  trailer: boolean
}

export type Capacities = {
  pcs?: number
  bc?: number
  sv?: number
  bv?: number
  mc?: number
  dc?: number
  inv?: number
  [key: string]: number | undefined
}

export type PraamidEvent = {
  uid: string
  dtstart: string
  dtend: string
  status: string
  capacities: Capacities
  ship: { code: string }
  transportationType: { code: string }
  pricelist?: { code: string }
  highPrice?: boolean
  isNextDay?: boolean
}

type ApiList<T> = { totalCount: number; items: T[] }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Praamid API ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

export async function listDirections(): Promise<Direction[]> {
  const data = await fetchJson<ApiList<Direction>>(`${BASE_URL}/directions`)
  return data.items
}

export async function listCapacityUnits(): Promise<CapacityUnit[]> {
  const data = await fetchJson<ApiList<CapacityUnit>>(
    `${BASE_URL}/capacity-units?type=all&items=true&include=MV`,
  )
  return data.items
}

export async function listEvents(
  direction: string,
  date: string,
  timeShift = 300,
): Promise<PraamidEvent[]> {
  const url = `${BASE_URL}/events?direction=${encodeURIComponent(direction)}&departure-date=${encodeURIComponent(date)}&time-shift=${timeShift}`
  const data = await fetchJson<ApiList<PraamidEvent>>(url)
  return data.items
}

export const SHIP_NAMES: Record<string, string> = {
  LE: 'Leiger',
  TI: 'Tiiu',
  TO: 'Tõll',
  PI: 'Piret',
  RE: 'Regula',
  HA: 'Harilaid',
  MU: 'Muhumaa',
  SE: 'Sebe',
  SA: 'Saaremaa',
  HI: 'Hiiumaa',
}

export const CAPACITY_LABELS: Record<string, string> = {
  sv: 'Small vehicles',
  bv: 'Large vehicles',
  pcs: 'Passengers',
  mc: 'Motorcycles',
  bc: 'Bicycles',
  inv: 'Disabled vehicle',
  dc: 'Dangerous cargo',
}

export const DIRECTION_LABELS: Record<string, string> = {
  VK: 'Virtsu → Kuivastu',
  KV: 'Kuivastu → Virtsu',
  RH: 'Rohuküla → Heltermaa',
  HR: 'Heltermaa → Rohuküla',
}

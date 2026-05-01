import 'server-only'
import { BASE_URL, publicFetch, type ApiList } from './client'
import type { CapacityUnit } from './types'

async function list(): Promise<CapacityUnit[]> {
  const data = await publicFetch<ApiList<CapacityUnit>>(
    `${BASE_URL}/capacity-units?type=all&items=true&include=MV`,
  )
  return data.items
}

export const capacityUnit = { list }

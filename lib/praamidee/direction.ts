import 'server-only'
import { BASE_URL, publicFetch, type ApiList } from './client'
import type { Direction } from './types'

async function list(): Promise<Direction[]> {
  const data = await publicFetch<ApiList<Direction>>(`${BASE_URL}/directions`)
  return data.items
}

export const direction = { list }

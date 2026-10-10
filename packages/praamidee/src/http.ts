import type { CredentialStore } from './credentials'
import { PraamidAuthError } from './errors'
import type { TokenManager } from './tokens'

export const BASE_URL = 'https://www.praamid.ee/online'

export type ApiList<T> = { totalCount: number; items: T[] }

export async function publicFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Praamid API ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

export function createAuthedClient(tokens: TokenManager, credentials: CredentialStore) {
  async function request(userId: string, path: string, init: RequestInit = {}) {
    const url = `${BASE_URL}${path}`
    const token = await tokens.accessToken(userId)
    if (!token) {
      throw new PraamidAuthError(401, url, 'no_credential')
    }

    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    headers.set('authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...init, headers })

    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 200)
      if (res.status === 401 || res.status === 403) {
        tokens.invalidate(userId)
        await credentials.markError(userId, `${path} ${res.status}`)
      }
      throw new PraamidAuthError(res.status, url, snippet)
    }

    await credentials.markVerified(userId)
    return res
  }

  return {
    request,
    async json<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
      const res = await request(userId, path, init)
      if (res.status === 204) return undefined as T
      return res.json() as Promise<T>
    },
  }
}

export type AuthedClient = ReturnType<typeof createAuthedClient>

import 'server-only'
import { markCredentialError, markVerified } from './auth/credentials'
import { getActiveAccessToken, invalidateCachedToken } from './auth/tokens'
import { PraamidAuthError } from './errors'

export const BASE_URL = 'https://www.praamid.ee/online'
export const LOGIN_BASE_URL = 'https://www.praamid.ee/login'

export type ApiList<T> = { totalCount: number; items: T[] }

// Public (unauthenticated) ---------------------------------------------------

export async function publicFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Praamid API ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

// Authenticated --------------------------------------------------------------

export async function authedRequest(
  userId: string,
  path: string,
  init: RequestInit = {},
  base: string = BASE_URL,
): Promise<Response> {
  const url = `${base}${path}`
  const token = await getActiveAccessToken(userId)
  if (!token) {
    throw new PraamidAuthError(401, url, 'no_credential')
  }

  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('authorization', `Bearer ${token}`)
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const snippet = body.slice(0, 200)
    if (res.status === 401 || res.status === 403) {
      invalidateCachedToken(userId)
      await markCredentialError(userId, `${path} ${res.status}`)
    }
    throw new PraamidAuthError(res.status, url, snippet)
  }

  // Side-effect: every successful authed call refreshes the credential's
  // verified-at and clears any stale lastError. Cheap local DB write.
  await markVerified(userId)
  return res
}

export async function authedFetch<T>(
  userId: string,
  path: string,
  init: RequestInit = {},
  base: string = BASE_URL,
): Promise<T> {
  const res = await authedRequest(userId, path, init, base)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

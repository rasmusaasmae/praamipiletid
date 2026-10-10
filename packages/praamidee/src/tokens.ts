import { decodeJwt, type CredentialStore } from './credentials'

const TOKEN_ENDPOINT =
  'https://auth.praamid.ee/auth/realms/praamid-online/protocol/openid-connect/token'
const CLIENT_ID = 'praamid-portal'

// Refresh slightly before the access token's `exp` to absorb clock skew and
// in-flight latency. 30s is enough headroom for a single round-trip.
const REFRESH_BUFFER_MS = 30_000

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`refresh failed ${res.status}: ${snippet}`)
  }
  return (await res.json()) as TokenResponse
}

function accessTokenExpiryMs(accessToken: string): number {
  try {
    const claims = decodeJwt(accessToken)
    if (typeof claims.exp === 'number') return claims.exp * 1000
  } catch {
    // fall through to a conservative default
  }
  // Praamid access tokens are ~5 min; if we can't decode, assume 60s so we
  // refresh aggressively rather than serving a stale token.
  return Date.now() + 60_000
}

export function createTokenManager(credentials: CredentialStore) {
  const cache = new Map<string, { accessToken: string; expiresAtMs: number }>()

  return {
    // A usable access token for the user, refreshed through the stored
    // refresh token when the cached one is missing or near expiry. Null when
    // the user has no live credential.
    async accessToken(userId: string): Promise<string | null> {
      const cached = cache.get(userId)
      if (cached && cached.expiresAtMs - Date.now() > REFRESH_BUFFER_MS) {
        return cached.accessToken
      }

      const stored = await credentials.refreshToken(userId)
      if (!stored || stored.expiresAt.getTime() <= Date.now()) {
        cache.delete(userId)
        return null
      }

      const tokens = await exchangeRefreshToken(stored.refreshToken)

      // Keycloak rotates refresh tokens when the feature is enabled — the new
      // one arrives in the response. Persist it so the next call uses the
      // rotated value.
      if (tokens.refresh_token && tokens.refresh_token !== stored.refreshToken) {
        await credentials.rotate(userId, tokens.refresh_token)
      }

      cache.set(userId, {
        accessToken: tokens.access_token,
        expiresAtMs: accessTokenExpiryMs(tokens.access_token),
      })
      return tokens.access_token
    },

    invalidate(userId: string): void {
      cache.delete(userId)
    },
  }
}

export type TokenManager = ReturnType<typeof createTokenManager>

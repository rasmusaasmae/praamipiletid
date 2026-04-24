import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { praamidCredentials } from '@/db/schema'
import { setAuthState, settleAuthState } from '@/lib/praamid-auth-state'

const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.PRAAMID_CRED_KEY
  if (!hex) {
    throw new Error('PRAAMID_CRED_KEY not set — required to encrypt praamid tokens')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(`PRAAMID_CRED_KEY must be 32 bytes (64 hex chars), got ${key.length}`)
  }
  return key
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag]).toString('base64')
}

export function decryptToken(blob: string): string {
  const key = getKey()
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Ciphertext too short')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(buf.length - TAG_BYTES)
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

type JwtPayload = {
  sub?: string
  sid?: string
  exp?: number
  [key: string]: unknown
}

function decodeJwt(token: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Not a JWT (expected 3 segments)')
  }
  const payloadB64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
  const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4)
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json) as JwtPayload
}

export type SaveCredentialResult = {
  expiresAt: Date
  praamidSub: string
}

export type CapturedTokens = {
  accessToken: string
  refreshToken: string
}

export async function saveCredential(
  userId: string,
  tokens: CapturedTokens,
): Promise<SaveCredentialResult> {
  const accessClaims = decodeJwt(tokens.accessToken)
  const refreshClaims = decodeJwt(tokens.refreshToken)
  if (!accessClaims.sub) throw new Error('access token missing sub claim')
  if (!refreshClaims.exp) throw new Error('refresh token missing exp claim')

  // The refresh_token is the long-lived credential (~7 days). The
  // access_token is ephemeral (~5 min) and is re-minted on demand via
  // getFreshAccessToken.
  const expiresAt = new Date(refreshClaims.exp * 1000)
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('refresh token already expired')
  }

  const refreshTokenEnc = encryptToken(tokens.refreshToken)
  const now = new Date()

  await db
    .insert(praamidCredentials)
    .values({
      userId,
      refreshTokenEnc,
      praamidSub: accessClaims.sub,
      sessionSid: accessClaims.sid ?? null,
      expiresAt,
      capturedAt: now,
      lastVerifiedAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: praamidCredentials.userId,
      set: {
        refreshTokenEnc,
        praamidSub: accessClaims.sub,
        sessionSid: accessClaims.sid ?? null,
        expiresAt,
        capturedAt: now,
        lastVerifiedAt: null,
        lastError: null,
      },
    })

  await setAuthState(userId, { status: 'authenticated' })

  return { expiresAt, praamidSub: accessClaims.sub }
}

export type ActiveCredential = {
  token: string
  expiresAt: Date
  praamidSub: string
}

const TOKEN_ENDPOINT =
  'https://auth.praamid.ee/auth/realms/praamid-online/protocol/openid-connect/token'
const CLIENT_ID = 'praamid-portal'

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

export async function getCredential(userId: string): Promise<ActiveCredential | null> {
  const [row] = await db
    .select({
      refreshTokenEnc: praamidCredentials.refreshTokenEnc,
      expiresAt: praamidCredentials.expiresAt,
      praamidSub: praamidCredentials.praamidSub,
    })
    .from(praamidCredentials)
    .where(eq(praamidCredentials.userId, userId))
    .limit(1)
  if (!row) return null

  const refreshToken = decryptToken(row.refreshTokenEnc)
  const tokens = await exchangeRefreshToken(refreshToken)

  // Keycloak rotates refresh tokens when the feature is enabled — the new
  // one arrives in the response. Persist it so the next call uses the
  // rotated value. If rotation is off, refresh_token is omitted and we
  // keep the stored one.
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    await db
      .update(praamidCredentials)
      .set({ refreshTokenEnc: encryptToken(tokens.refresh_token) })
      .where(eq(praamidCredentials.userId, userId))
  }

  return {
    token: tokens.access_token,
    expiresAt: row.expiresAt,
    praamidSub: row.praamidSub,
  }
}

export type CredentialStatus = {
  praamidSub: string
  expiresAt: Date
  capturedAt: Date
  lastVerifiedAt: Date | null
  lastError: string | null
}

export async function getCredentialStatus(userId: string): Promise<CredentialStatus | null> {
  const [row] = await db
    .select({
      praamidSub: praamidCredentials.praamidSub,
      expiresAt: praamidCredentials.expiresAt,
      capturedAt: praamidCredentials.capturedAt,
      lastVerifiedAt: praamidCredentials.lastVerifiedAt,
      lastError: praamidCredentials.lastError,
    })
    .from(praamidCredentials)
    .where(eq(praamidCredentials.userId, userId))
    .limit(1)
  return row ?? null
}

export async function markVerified(userId: string): Promise<void> {
  await db
    .update(praamidCredentials)
    .set({ lastVerifiedAt: new Date(), lastError: null })
    .where(eq(praamidCredentials.userId, userId))
}

export async function invalidateCredential(userId: string, reason: string): Promise<void> {
  await db
    .update(praamidCredentials)
    .set({ lastError: reason })
    .where(eq(praamidCredentials.userId, userId))
  // The refresh token might still be valid — only the last API call failed.
  // Keep the live status based on credential presence and surface the error.
  await settleAuthState(userId, { lastError: reason })
}

export async function forgetCredential(userId: string): Promise<void> {
  await db.delete(praamidCredentials).where(eq(praamidCredentials.userId, userId))
  await setAuthState(userId, { status: 'unauthenticated' })
}

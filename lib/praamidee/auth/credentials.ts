import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { praamidCredentials } from '@/db/schema'

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

export function decodeJwt(token: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Not a JWT (expected 3 segments)')
  }
  const payloadB64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
  const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4)
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json) as JwtPayload
}

export type CapturedTokens = {
  accessToken: string
  refreshToken: string
}

export type SaveCredentialResult = {
  expiresAt: Date
  praamidSub: string
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
  // access_token is ephemeral (~5 min) and is re-minted on demand.
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

  return { expiresAt, praamidSub: accessClaims.sub }
}

export type StoredRefreshToken = {
  refreshToken: string
  expiresAt: Date
  praamidSub: string
}

export async function getStoredRefreshToken(userId: string): Promise<StoredRefreshToken | null> {
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
  return {
    refreshToken: decryptToken(row.refreshTokenEnc),
    expiresAt: row.expiresAt,
    praamidSub: row.praamidSub,
  }
}

export async function rotateRefreshToken(userId: string, newRefreshToken: string): Promise<void> {
  await db
    .update(praamidCredentials)
    .set({ refreshTokenEnc: encryptToken(newRefreshToken) })
    .where(eq(praamidCredentials.userId, userId))
}

export type CredentialMeta = {
  praamidSub: string
  expiresAt: Date
  capturedAt: Date
  lastVerifiedAt: Date | null
  lastError: string | null
}

export async function getCredentialMeta(userId: string): Promise<CredentialMeta | null> {
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

export async function markCredentialError(userId: string, reason: string): Promise<void> {
  await db
    .update(praamidCredentials)
    .set({ lastError: reason })
    .where(eq(praamidCredentials.userId, userId))
}

export async function deleteCredential(userId: string): Promise<void> {
  await db.delete(praamidCredentials).where(eq(praamidCredentials.userId, userId))
}

export async function hasCredential(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: praamidCredentials.userId })
    .from(praamidCredentials)
    .where(eq(praamidCredentials.userId, userId))
    .limit(1)
  return Boolean(row)
}

export async function listCredentialedUserIds(): Promise<string[]> {
  const rows = await db.select({ userId: praamidCredentials.userId }).from(praamidCredentials)
  return rows.map((r) => r.userId)
}

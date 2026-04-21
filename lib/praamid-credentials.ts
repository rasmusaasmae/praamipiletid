import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
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

type UserCtx = {
  accessToken?: string
  access_token?: string
  [key: string]: unknown
}

export type SaveCredentialResult = {
  expiresAt: Date
  praamidSub: string
}

export async function saveCredential(
  userId: string,
  rawUserCtxJson: string,
): Promise<SaveCredentialResult> {
  let parsed: UserCtx
  try {
    parsed = JSON.parse(rawUserCtxJson) as UserCtx
  } catch {
    throw new Error('Invalid user-ctx JSON')
  }
  const token = parsed.accessToken ?? parsed.access_token
  if (!token || typeof token !== 'string') {
    throw new Error('user-ctx missing accessToken')
  }

  const claims = decodeJwt(token)
  if (!claims.sub) throw new Error('JWT missing sub claim')
  if (!claims.exp) throw new Error('JWT missing exp claim')
  const expiresAt = new Date(claims.exp * 1000)
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('JWT already expired')
  }

  const accessTokenEnc = encryptToken(token)
  const now = new Date()

  await db
    .insert(praamidCredentials)
    .values({
      userId,
      accessTokenEnc,
      praamidSub: claims.sub,
      sessionSid: claims.sid ?? null,
      expiresAt,
      capturedAt: now,
      lastVerifiedAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: praamidCredentials.userId,
      set: {
        accessTokenEnc,
        praamidSub: claims.sub,
        sessionSid: claims.sid ?? null,
        expiresAt,
        capturedAt: now,
        lastVerifiedAt: null,
        lastError: null,
      },
    })

  return { expiresAt, praamidSub: claims.sub }
}

export type ActiveCredential = {
  token: string
  expiresAt: Date
  praamidSub: string
}

export async function getCredential(userId: string): Promise<ActiveCredential | null> {
  const [row] = await db
    .select({
      accessTokenEnc: praamidCredentials.accessTokenEnc,
      expiresAt: praamidCredentials.expiresAt,
      praamidSub: praamidCredentials.praamidSub,
    })
    .from(praamidCredentials)
    .where(eq(praamidCredentials.userId, userId))
    .limit(1)
  if (!row) return null
  const token = decryptToken(row.accessTokenEnc)
  return { token, expiresAt: row.expiresAt, praamidSub: row.praamidSub }
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
}

export async function forgetCredential(userId: string): Promise<void> {
  await db.delete(praamidCredentials).where(eq(praamidCredentials.userId, userId))
}

export type ReauthCandidate = {
  userId: string
  expiresAt: Date
}

export async function listCredentialsNeedingReauth(
  hoursBefore: number,
): Promise<ReauthCandidate[]> {
  const cutoff = new Date(Date.now() + hoursBefore * 60 * 60 * 1000)
  return db
    .select({
      userId: praamidCredentials.userId,
      expiresAt: praamidCredentials.expiresAt,
    })
    .from(praamidCredentials)
    .where(lt(praamidCredentials.expiresAt, cutoff))
}

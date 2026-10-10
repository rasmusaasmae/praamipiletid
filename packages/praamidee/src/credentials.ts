import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { praamidCredentials, type Db } from '@praamipiletid/db'
import { eq, gt, lte } from 'drizzle-orm'

const IV_BYTES = 12
const TAG_BYTES = 16

function parseKey(hex: string): Buffer {
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(`PRAAMID_CRED_KEY must be 32 bytes (64 hex chars), got ${key.length}`)
  }
  return key
}

export function encryptToken(keyHex: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', parseKey(keyHex), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64')
}

export function decryptToken(keyHex: string, blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Ciphertext too short')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(buf.length - TAG_BYTES)
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', parseKey(keyHex), iv)
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
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JwtPayload
}

export type CapturedTokens = {
  accessToken: string
  refreshToken: string
}

export type CredentialMeta = {
  praamidSub: string
  expiresAt: Date
  capturedAt: Date
  lastVerifiedAt: Date | null
  lastError: string | null
}

export type StoredRefreshToken = {
  refreshToken: string
  expiresAt: Date
}

export function createCredentialStore(db: Db, keyHex: string) {
  return {
    async save(userId: string, tokens: CapturedTokens): Promise<void> {
      const accessClaims = decodeJwt(tokens.accessToken)
      const refreshClaims = decodeJwt(tokens.refreshToken)
      if (!accessClaims.sub) throw new Error('access token missing sub claim')
      if (!refreshClaims.exp) throw new Error('refresh token missing exp claim')

      // The refresh token is the long-lived credential (~7 days). The access
      // token is ephemeral (~5 min) and is re-minted on demand.
      const expiresAt = new Date(refreshClaims.exp * 1000)
      if (expiresAt.getTime() <= Date.now()) {
        throw new Error('refresh token already expired')
      }

      const values = {
        refreshTokenEnc: encryptToken(keyHex, tokens.refreshToken),
        praamidSub: accessClaims.sub,
        sessionSid: accessClaims.sid ?? null,
        expiresAt,
        capturedAt: new Date(),
        lastVerifiedAt: null,
        lastError: null,
      }
      await db
        .insert(praamidCredentials)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: praamidCredentials.userId, set: values })
    },

    async refreshToken(userId: string): Promise<StoredRefreshToken | null> {
      const [row] = await db
        .select({
          refreshTokenEnc: praamidCredentials.refreshTokenEnc,
          expiresAt: praamidCredentials.expiresAt,
        })
        .from(praamidCredentials)
        .where(eq(praamidCredentials.userId, userId))
        .limit(1)
      if (!row) return null
      return {
        refreshToken: decryptToken(keyHex, row.refreshTokenEnc),
        expiresAt: row.expiresAt,
      }
    },

    async rotate(userId: string, newRefreshToken: string): Promise<void> {
      // A rotated refresh token carries its own exp; keep expiresAt in step.
      const { exp } = decodeJwt(newRefreshToken)
      await db
        .update(praamidCredentials)
        .set({
          refreshTokenEnc: encryptToken(keyHex, newRefreshToken),
          ...(exp ? { expiresAt: new Date(exp * 1000) } : {}),
        })
        .where(eq(praamidCredentials.userId, userId))
    },

    async meta(userId: string): Promise<CredentialMeta | null> {
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
    },

    async markVerified(userId: string): Promise<void> {
      await db
        .update(praamidCredentials)
        .set({ lastVerifiedAt: new Date(), lastError: null })
        .where(eq(praamidCredentials.userId, userId))
    },

    async markError(userId: string, reason: string): Promise<void> {
      await db
        .update(praamidCredentials)
        .set({ lastError: reason })
        .where(eq(praamidCredentials.userId, userId))
    },

    async remove(userId: string): Promise<void> {
      await db.delete(praamidCredentials).where(eq(praamidCredentials.userId, userId))
    },

    async exists(userId: string): Promise<boolean> {
      return (await this.meta(userId)) !== null
    },

    async liveUserIds(): Promise<string[]> {
      const rows = await db
        .select({ userId: praamidCredentials.userId })
        .from(praamidCredentials)
        .where(gt(praamidCredentials.expiresAt, new Date()))
      return rows.map((r) => r.userId)
    },

    // Expired refresh tokens are useless; don't keep them around encrypted at rest.
    async removeExpired(): Promise<number> {
      const rows = await db
        .delete(praamidCredentials)
        .where(lte(praamidCredentials.expiresAt, new Date()))
        .returning({ userId: praamidCredentials.userId })
      return rows.length
    },
  }
}

export type CredentialStore = ReturnType<typeof createCredentialStore>

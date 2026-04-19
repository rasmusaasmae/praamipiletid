import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { db } from '@/db'
import { praamidCsrfNonces } from '@/db/schema'

const NONCE_TTL_MS = 30 * 60 * 1000
const NONCE_BYTES = 24

export async function issueCsrfNonce(userId: string): Promise<string> {
  const nonce = randomBytes(NONCE_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS)
  await db.insert(praamidCsrfNonces).values({ nonce, userId, expiresAt })
  return nonce
}

export async function consumeCsrfNonce(userId: string, nonce: string): Promise<boolean> {
  const now = new Date()
  const res = await db
    .update(praamidCsrfNonces)
    .set({ usedAt: now })
    .where(
      and(
        eq(praamidCsrfNonces.nonce, nonce),
        eq(praamidCsrfNonces.userId, userId),
        gt(praamidCsrfNonces.expiresAt, now),
        isNull(praamidCsrfNonces.usedAt),
      ),
    )
    .returning({ nonce: praamidCsrfNonces.nonce })
  return res.length > 0
}

export async function pruneExpiredCsrfNonces(): Promise<void> {
  const cutoff = new Date(Date.now() - NONCE_TTL_MS)
  await db.delete(praamidCsrfNonces).where(lt(praamidCsrfNonces.expiresAt, cutoff))
}

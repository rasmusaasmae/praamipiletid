import 'server-only'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { praamidAuthState } from '@/db/schema'

import type { PraamidAuthStatus } from '../types'
import { hasCredential } from './credentials'

export type AuthStatePatch = {
  status: PraamidAuthStatus
  lastError?: string | null
}

// Upsert the observable login state for a user.
export async function setAuthState(userId: string, patch: AuthStatePatch): Promise<void> {
  const lastError = patch.lastError ?? null
  const now = new Date()
  await db
    .insert(praamidAuthState)
    .values({
      userId,
      status: patch.status,
      lastError,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: praamidAuthState.userId,
      set: {
        status: patch.status,
        lastError,
        updatedAt: now,
      },
    })
}

// Terminal write at the end of a login flow (error, cancel, or explicit
// forget). Falls back to the user's underlying credential presence: if a
// stored refresh token still exists we keep showing 'authenticated' (the
// user is still functional) and surface the error in last_error; otherwise
// we drop to 'unauthenticated'. `forceUnauth` skips the credential check —
// callers that just deleted the credential row pass true.
export async function settleAuthState(
  userId: string,
  opts: { lastError?: string | null; forceUnauth?: boolean } = {},
): Promise<void> {
  let status: PraamidAuthStatus = 'unauthenticated'
  if (!opts.forceUnauth && (await hasCredential(userId))) {
    status = 'authenticated'
  }
  await setAuthState(userId, { status, lastError: opts.lastError ?? null })
}

export type AuthStateRow = {
  status: PraamidAuthStatus
  lastError: string | null
}

export async function getAuthState(userId: string): Promise<AuthStateRow> {
  const [row] = await db
    .select({ status: praamidAuthState.status, lastError: praamidAuthState.lastError })
    .from(praamidAuthState)
    .where(eq(praamidAuthState.userId, userId))
    .limit(1)
  return {
    status: (row?.status as PraamidAuthStatus | undefined) ?? 'unauthenticated',
    lastError: row?.lastError ?? null,
  }
}

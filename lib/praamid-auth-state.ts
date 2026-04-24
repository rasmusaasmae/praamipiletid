import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { praamidAuthState, praamidCredentials, type PraamidAuthStatus } from '@/db/schema'

export type AuthStatePatch = {
  status: PraamidAuthStatus
  lastError?: string | null
}

// Upsert the observable login state for a user. Read side goes through
// `getMyPraamidAuthState()` in lib/queries; callers here just describe the
// next state and we persist it.
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
  if (!opts.forceUnauth) {
    const [row] = await db
      .select({ userId: praamidCredentials.userId })
      .from(praamidCredentials)
      .where(eq(praamidCredentials.userId, userId))
      .limit(1)
    if (row) status = 'authenticated'
  }
  await setAuthState(userId, { status, lastError: opts.lastError ?? null })
}

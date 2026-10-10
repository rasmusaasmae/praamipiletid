import { notifyUserChanged, praamidAuthState, type Db } from '@praamipiletid/db'
import { eq } from 'drizzle-orm'

import type { CredentialStore } from './credentials'
import type { PraamidAuthStatus } from './types'

export type AuthStateRow = {
  status: PraamidAuthStatus
  lastError: string | null
}

// Observable progress of the praamid.ee login, readable by the UI. The
// encrypted credential itself lives in praamid_credentials.
export function createAuthStateStore(db: Db, credentials: CredentialStore) {
  async function set(userId: string, status: PraamidAuthStatus, lastError: string | null = null) {
    const values = { status, lastError, updatedAt: new Date() }
    await db
      .insert(praamidAuthState)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: praamidAuthState.userId, set: values })
    await notifyUserChanged(db, userId)
  }

  return {
    set,

    async get(userId: string): Promise<AuthStateRow> {
      const [row] = await db
        .select({ status: praamidAuthState.status, lastError: praamidAuthState.lastError })
        .from(praamidAuthState)
        .where(eq(praamidAuthState.userId, userId))
        .limit(1)
      return {
        status: (row?.status as PraamidAuthStatus | undefined) ?? 'unauthenticated',
        lastError: row?.lastError ?? null,
      }
    },

    // Terminal write at the end of a login attempt (error or cancel). A user
    // who still holds a stored credential stays authenticated and sees the
    // error alongside; otherwise they drop to unauthenticated.
    async settle(userId: string, lastError: string | null = null): Promise<void> {
      const status = (await credentials.exists(userId)) ? 'authenticated' : 'unauthenticated'
      await set(userId, status, lastError)
    },

    // Logins in flight belong to the process that ran them. After a restart
    // nothing is driving them any more, so settle them.
    async settleAbandoned(): Promise<void> {
      const rows = await db
        .select({ userId: praamidAuthState.userId, status: praamidAuthState.status })
        .from(praamidAuthState)
      for (const row of rows) {
        if (row.status === 'loading' || row.status === 'awaiting_confirmation') {
          await this.settle(row.userId, 'login_interrupted')
        }
      }
    },
  }
}

export type AuthStateStore = ReturnType<typeof createAuthStateStore>

import 'server-only'
import { startLoginBot, cancelLoginBot } from '../auth/bot'
import { deleteCredential, getCredentialMeta } from '../auth/credentials'
import { getAuthState, setAuthState } from '../auth/state'
import { invalidateCachedToken } from '../auth/tokens'
import type { AuthInfo } from '../types'

export async function getAuthInfo(userId: string): Promise<AuthInfo> {
  const [state, meta] = await Promise.all([getAuthState(userId), getCredentialMeta(userId)])
  // The stored status is only written by the login flow; it says nothing
  // about expiry. 'authenticated' holds only while an unexpired credential
  // backs it.
  const live = meta !== null && meta.expiresAt.getTime() > Date.now()
  return {
    status: state.status === 'authenticated' && !live ? 'unauthenticated' : state.status,
    lastError: state.lastError,
    praamidSub: meta?.praamidSub ?? null,
    capturedAt: meta?.capturedAt ?? null,
    expiresAt: meta?.expiresAt ?? null,
    lastVerifiedAt: meta?.lastVerifiedAt ?? null,
  }
}

export async function startLogin(userId: string, isikukood: string): Promise<void> {
  await startLoginBot(userId, isikukood)
}

export async function cancelLogin(userId: string): Promise<void> {
  await cancelLoginBot(userId)
}

export async function forget(userId: string): Promise<void> {
  invalidateCachedToken(userId)
  await deleteCredential(userId)
  await setAuthState(userId, { status: 'unauthenticated' })
}

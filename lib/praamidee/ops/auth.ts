import 'server-only'
import { startLoginBot, cancelLoginBot } from '../auth/bot'
import { deleteCredential, getCredentialMeta } from '../auth/credentials'
import { getAuthState, setAuthState } from '../auth/state'
import { invalidateCachedToken } from '../auth/tokens'
import type { AuthInfo } from '../types'

export async function getAuthInfo(userId: string): Promise<AuthInfo> {
  const [state, meta] = await Promise.all([getAuthState(userId), getCredentialMeta(userId)])
  return {
    status: state.status,
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

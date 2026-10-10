import type { Db } from '@praamipiletid/db'

import { createCredentialStore } from './credentials'
import { PraamidAuthError } from './errors'
import { BASE_URL, createAuthedClient, publicFetch, type ApiList } from './http'
import type { Praamid } from './port'
import { createAuthStateStore } from './state'
import { createTokenManager } from './tokens'
import type {
  AuthInfo,
  Booking,
  BookingBalance,
  CommitZeroSumResult,
  PraamidEvent,
  Ticket,
} from './types'

// Praamid's events endpoint accepts a time-shift in seconds that biases the
// schedule window we get back. 300s is the value the official site uses.
const EVENTS_TIME_SHIFT = 300

// Postgres NOTIFY channel the API uses to hand login requests to the worker,
// which owns the browser.
export const LOGIN_CHANNEL = 'praamid_login'
export type LoginRequest =
  | { action: 'start'; userId: string; isikukood: string }
  | { action: 'cancel'; userId: string }

export function createPraamidee({ db, credKey }: { db: Db; credKey: string }) {
  const credentials = createCredentialStore(db, credKey)
  const tokens = createTokenManager(credentials)
  const state = createAuthStateStore(db, credentials)
  const http = createAuthedClient(tokens, credentials)

  const praamid: Praamid = {
    async events(direction, date) {
      const url = `${BASE_URL}/events?direction=${encodeURIComponent(direction)}&departure-date=${encodeURIComponent(date)}&time-shift=${EVENTS_TIME_SHIFT}`
      return (await publicFetch<ApiList<PraamidEvent>>(url)).items
    },

    loggedInUserIds: () => credentials.liveUserIds(),

    user(userId) {
      const bookingPath = (uid: string) => `/bookings/${encodeURIComponent(uid)}`
      return {
        loginExpiresAt: async () => (await credentials.meta(userId))?.expiresAt ?? null,

        tickets: async () => (await http.json<ApiList<Ticket>>(userId, '/tickets')).items,

        booking: (uid) => http.json<Booking>(userId, bookingPath(uid)),

        async editTicket(ticketCode, body) {
          const res = await http.request(userId, `/tickets/${encodeURIComponent(ticketCode)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (res.status !== 204) {
            throw new PraamidAuthError(res.status, res.url, `expected 204, got ${res.status}`)
          }
        },

        balance: (uid) => http.json<BookingBalance>(userId, `${bookingPath(uid)}/balance`),

        async commitZeroSum(uid): Promise<CommitZeroSumResult> {
          const res = await http.request(userId, `${bookingPath(uid)}/invoices`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ zeroSum: true }),
          })
          const location = res.headers.get('location')
          const match = location?.match(/\/invoices\/([^/?#]+)\/?$/)
          if (res.status !== 201 || !match) {
            throw new PraamidAuthError(
              res.status,
              res.url,
              `expected 201 with an invoice Location, got ${res.status} ${location ?? '(none)'}`,
            )
          }
          return { invoiceNumber: decodeURIComponent(match[1]!) }
        },
      }
    },
  }

  const login = {
    async info(userId: string): Promise<AuthInfo> {
      const [current, meta] = await Promise.all([state.get(userId), credentials.meta(userId)])
      // The stored status only says how the last login went; 'authenticated'
      // holds only while an unexpired credential backs it.
      const live = meta !== null && meta.expiresAt.getTime() > Date.now()
      return {
        status: current.status === 'authenticated' && !live ? 'unauthenticated' : current.status,
        lastError: current.lastError,
        praamidSub: meta?.praamidSub ?? null,
        capturedAt: meta?.capturedAt ?? null,
        expiresAt: meta?.expiresAt ?? null,
        lastVerifiedAt: meta?.lastVerifiedAt ?? null,
      }
    },

    async forget(userId: string): Promise<void> {
      tokens.invalidate(userId)
      await credentials.remove(userId)
      await state.set(userId, 'unauthenticated')
    },

    markLoading: (userId: string) => state.set(userId, 'loading'),
  }

  return { praamid, login, credentials, tokens, state }
}

export type Praamidee = ReturnType<typeof createPraamidee>

export { PraamidAuthError } from './errors'
export type { Praamid, PraamidUser } from './port'
export * from './types'

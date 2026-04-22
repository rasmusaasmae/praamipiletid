'use client'

import { QueryClient } from '@tanstack/react-query'
import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions, isChangeMessage } from '@tanstack/electric-db-collection'
import { z } from 'zod'
import { updateTrip } from '@/actions/trips'

// Single shared QueryClient for the app. Exposed here so collections and the
// provider wrapper can both reach the same instance.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
})

// All collections hit the same auth-gated gateway; Electric's `where` is
// injected server-side from the better-auth session, so clients never need
// to pass user-scope params themselves.
//
// Must be an absolute URL — Electric's client constructs `new URL(SHAPE_URL)`
// without a base, which WebKit/Safari reject for relative paths. This module
// is `'use client'` so `window` is always defined at eval time on the client;
// during SSR evaluation the collections aren't actually synced.
const SHAPE_URL =
  typeof window !== 'undefined' ? `${window.location.origin}/api/shape` : '/api/shape'

// Shared parser: Electric returns timestamptz as ISO strings; we want Date.
const parser = {
  timestamptz: (value: string) => new Date(value),
}

const tripSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  direction: z.string(),
  measurement_unit: z.string(),
  notify: z.boolean(),
  edit: z.boolean(),
  last_checked_at: z.coerce.date().nullable(),
  swap_in_progress: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})
export type TripRow = z.infer<typeof tripSchema>

export const tripsCollection = createCollection(
  electricCollectionOptions({
    id: 'trips',
    schema: tripSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'trips' }, parser },
    getKey: (row) => row.id,
    // Optimistic toggles for notify/edit. Server actions don't return Postgres
    // txids, so we wait for Electric to stream the update back matching this
    // row's key — reconciles the local optimistic state once the write lands.
    onUpdate: async ({ transaction, collection }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const { original, changes } = mutation
          const form = new FormData()
          form.set('id', original.id)
          if ('notify' in changes) form.set('notify', changes.notify ? 'true' : '')
          if ('edit' in changes) form.set('edit', changes.edit ? 'true' : '')
          const res = await updateTrip(form)
          if (!res.ok) throw new Error(res.error)
          await collection.utils.awaitMatch(
            (message) =>
              isChangeMessage(message) &&
              message.headers.operation === 'update' &&
              message.value.id === original.id,
            5000,
          )
        }),
      )
    },
  }),
)

const tripOptionSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  user_id: z.string(),
  priority: z.number(),
  event_uid: z.string(),
  event_date: z.string(),
  event_dtstart: z.coerce.date(),
  stop_before_at: z.coerce.date(),
  last_capacity: z.number().nullable(),
  last_capacity_state: z.string().nullable(),
  last_capacity_checked_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})
export type TripOptionRow = z.infer<typeof tripOptionSchema>

export const tripOptionsCollection = createCollection(
  electricCollectionOptions({
    id: 'trip_options',
    schema: tripOptionSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'trip_options' }, parser },
    getKey: (row) => row.id,
  }),
)

const ticketSchema = z.object({
  trip_id: z.string(),
  user_id: z.string(),
  ticket_code: z.string(),
  ticket_number: z.string(),
  booking_uid: z.string(),
  event_uid: z.string(),
  ticket_date: z.string(),
  event_dtstart: z.coerce.date(),
  captured_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})
export type TicketRow = z.infer<typeof ticketSchema>

export const ticketsCollection = createCollection(
  electricCollectionOptions({
    id: 'tickets',
    schema: ticketSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'tickets' }, parser },
    getKey: (row) => row.trip_id,
  }),
)

// praamid_credentials is intentionally NOT exposed as a collection here —
// the row contains an encrypted access token. Settings page still reads
// status server-side via getCredentialStatus. If we ever surface it to the
// client, use the `columns` shape param to whitelist safe fields.

const praamidAuthStateSchema = z.object({
  user_id: z.string(),
  status: z.enum(['unauthenticated', 'loading', 'awaiting_confirmation', 'authenticated']),
  last_error: z.string().nullable(),
  updated_at: z.coerce.date(),
})
export type PraamidAuthStateRow = z.infer<typeof praamidAuthStateSchema>

export const praamidAuthStateCollection = createCollection(
  electricCollectionOptions({
    id: 'praamid_auth_state',
    schema: praamidAuthStateSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'praamid_auth_state' }, parser },
    getKey: (row) => row.user_id,
  }),
)

// ---------- Admin-only collections ----------

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  email_verified: z.boolean(),
  image: z.string().nullable(),
  role: z.string(),
  banned: z.boolean(),
  ban_reason: z.string().nullable(),
  ban_expires: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})
export type UserRow = z.infer<typeof userSchema>

export const usersCollection = createCollection(
  electricCollectionOptions({
    id: 'user',
    schema: userSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'user' }, parser },
    getKey: (row) => row.id,
  }),
)

const auditLogSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  actor: z.string(),
  type: z.string(),
  trip_id: z.string().nullable(),
  payload: z.string().nullable(),
  created_at: z.coerce.date(),
})
export type AuditLogRow = z.infer<typeof auditLogSchema>

export const auditLogsCollection = createCollection(
  electricCollectionOptions({
    id: 'audit_logs',
    schema: auditLogSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'audit_logs' }, parser },
    getKey: (row) => row.id,
  }),
)

const settingRowSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.coerce.date(),
})
export type SettingRow = z.infer<typeof settingRowSchema>

export const settingsCollection = createCollection(
  electricCollectionOptions({
    id: 'settings',
    schema: settingRowSchema,
    shapeOptions: { url: SHAPE_URL, params: { table: 'settings' }, parser },
    getKey: (row) => row.key,
  }),
)

// Admin-scoped views of the user-scoped tables. Gateway opt-in via
// ?scope=admin → returns every user's rows; non-admin requests are rejected.
export const adminTripsCollection = createCollection(
  electricCollectionOptions({
    id: 'trips-admin',
    schema: tripSchema,
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'trips', scope: 'admin' },
      parser,
    },
    getKey: (row) => row.id,
  }),
)

export const adminTripOptionsCollection = createCollection(
  electricCollectionOptions({
    id: 'trip_options-admin',
    schema: tripOptionSchema,
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'trip_options', scope: 'admin' },
      parser,
    },
    getKey: (row) => row.id,
  }),
)

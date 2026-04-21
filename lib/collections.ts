'use client'

import { QueryClient } from '@tanstack/react-query'
import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { z } from 'zod'

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
const SHAPE_URL = '/api/shape'

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

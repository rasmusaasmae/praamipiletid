import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { user } from './auth-schema'

export * from './auth-schema'

// Mirror of praamid.ee tickets the user currently holds. Identity is
// praamid's ticketId (`id`) — every swap mints a fresh ticket with a new
// id, linked to its predecessor via parentTicketId. The mirror is rebuilt
// each sync; rows that vanish from praamid's response are deleted.
// ticket_options follow swaps via parentTicketId-rewire in the sync.
export const tickets = pgTable(
  'tickets',
  {
    id: integer('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookingUid: text('booking_uid').notNull(),
    bookingReferenceNumber: text('booking_reference_number').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    ticketCode: text('ticket_code').notNull(),
    ticketNumber: text('ticket_number').notNull(),
    direction: text('direction').notNull(),
    measurementUnit: text('measurement_unit').notNull(),
    eventUid: text('event_uid').notNull(),
    eventDtstart: timestamp('event_dtstart', { withTimezone: true, mode: 'date' }).notNull(),
    ticketDate: text('ticket_date').notNull(),
    parentTicketId: integer('parent_ticket_id'),
    swapInProgress: boolean('swap_in_progress').default(false).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('tickets_user_id_idx').on(table.userId),
    index('tickets_booking_uid_idx').on(table.bookingUid),
    index('tickets_parent_ticket_id_idx').on(table.parentTicketId),
  ],
)

export const ticketOptions = pgTable(
  'ticket_options',
  {
    id: text('id').primaryKey(),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull(),
    eventUid: text('event_uid').notNull(),
    eventDate: text('event_date').notNull(),
    eventDtstart: timestamp('event_dtstart', { withTimezone: true, mode: 'date' }).notNull(),
    stopBeforeMinutes: integer('stop_before_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('ticket_options_event_unique').on(table.ticketId, table.eventUid),
    uniqueIndex('ticket_options_priority_unique').on(table.ticketId, table.priority),
    index('ticket_options_dtstart_idx').on(table.eventDtstart),
  ],
)

export const praamidCredentials = pgTable(
  'praamid_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    praamidSub: text('praamid_sub').notNull(),
    sessionSid: text('session_sid'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('praamid_credentials_expires_at_idx').on(table.expiresAt)],
)

// Observable mirror of the praamid auth flow. praamid_credentials holds the
// encrypted refresh token and cannot be exposed to the client; this table
// holds only observable state so the UI can render the login stepper.
export const praamidAuthState = pgTable('praamid_auth_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status').default('unauthenticated').notNull(),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export type PraamidCredential = typeof praamidCredentials.$inferSelect
export type NewPraamidCredential = typeof praamidCredentials.$inferInsert
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type TicketOption = typeof ticketOptions.$inferSelect
export type NewTicketOption = typeof ticketOptions.$inferInsert
export type PraamidAuthState = typeof praamidAuthState.$inferSelect
export type NewPraamidAuthState = typeof praamidAuthState.$inferInsert

// Flow state the user observes via RSC refresh. last_error rides alongside
// any status when the previous flow ended with an error — there is no
// separate error state, just unauthenticated/authenticated with a message.
export const PRAAMID_AUTH_STATUSES = [
  'unauthenticated',
  'loading',
  'awaiting_confirmation',
  'authenticated',
] as const
export type PraamidAuthStatus = (typeof PRAAMID_AUTH_STATUSES)[number]

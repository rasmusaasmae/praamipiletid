import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

export * from './auth-schema'

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const SUPPORTED_LOCALES = ['et', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'et'

// Per-user preferences that don't belong on the better-auth `user` row
// (which is kept tight to columns better-auth itself manages). The locale
// column is what server code uses when rendering on behalf of the user,
// e.g. composing notification messages.
export const userSettings = pgTable(
  'user_settings',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    ntfyTopic: text('ntfy_topic').notNull().unique(),
    locale: text('locale').default(DEFAULT_LOCALE).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'user_settings_locale_check',
      sql.raw(`${table.locale.name} IN (${SUPPORTED_LOCALES.map((l) => `'${l}'`).join(', ')})`),
    ),
  ],
)

// Cache of the user's praamid.ee tickets that they have opted into
// monitoring. PK is (userId, bookingUid): bookingUid is praamid's stable
// booking handle and survives a swap (the ticket inside the booking
// changes, the booking stays). Options FK against this composite, so they
// stay attached to the same row across an in-place ticket swap.
export const tickets = pgTable(
  'tickets',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookingUid: text('booking_uid').notNull(),
    ticketId: integer('ticket_id').notNull(),
    ticketCode: text('ticket_code').notNull(),
    ticketNumber: text('ticket_number').notNull(),
    direction: text('direction').notNull(),
    measurementUnit: text('measurement_unit').notNull(),
    eventUid: text('event_uid').notNull(),
    eventDtstart: timestamp('event_dtstart', { withTimezone: true, mode: 'date' }).notNull(),
    ticketDate: text('ticket_date').notNull(),
    swapInProgress: boolean('swap_in_progress').default(false).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'tickets_pk', columns: [table.userId, table.bookingUid] }),
    index('tickets_user_id_idx').on(table.userId),
    index('tickets_event_uid_idx').on(table.eventUid),
  ],
)

export const ticketOptions = pgTable(
  'ticket_options',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookingUid: text('booking_uid').notNull(),
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
    foreignKey({
      name: 'ticket_options_ticket_fk',
      columns: [table.userId, table.bookingUid],
      foreignColumns: [tickets.userId, tickets.bookingUid],
    }).onDelete('cascade'),
    uniqueIndex('ticket_options_event_unique').on(table.bookingUid, table.eventUid),
    uniqueIndex('ticket_options_priority_unique').on(table.bookingUid, table.priority),
    index('ticket_options_dtstart_idx').on(table.eventDtstart),
    index('ticket_options_user_id_idx').on(table.userId),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    type: text('type').notNull(),
    payload: text('payload'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_user_created_idx').on(table.userId, table.createdAt),
    index('audit_logs_type_idx').on(table.type),
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

export type Setting = typeof settings.$inferSelect
export type PraamidCredential = typeof praamidCredentials.$inferSelect
export type NewPraamidCredential = typeof praamidCredentials.$inferInsert
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type TicketOption = typeof ticketOptions.$inferSelect
export type NewTicketOption = typeof ticketOptions.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
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

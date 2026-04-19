import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

export * from './auth-schema'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})

export const trips = sqliteTable(
  'trips',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    measurementUnit: text('measurement_unit').notNull(),
    notify: integer('notify', { mode: 'boolean' }).default(true).notNull(),
    edit: integer('edit', { mode: 'boolean' }).default(false).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('trips_user_id_idx').on(table.userId)],
)

export const tickets = sqliteTable(
  'tickets',
  {
    tripId: text('trip_id')
      .primaryKey()
      .references(() => trips.id, { onDelete: 'cascade' }),
    ticketCode: text('ticket_code').notNull(),
    ticketNumber: text('ticket_number').notNull(),
    bookingUid: text('booking_uid').notNull(),
    eventUid: text('event_uid').notNull(),
    ticketDate: text('ticket_date').notNull(),
    eventDtstart: integer('event_dtstart', { mode: 'timestamp_ms' }).notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('tickets_event_uid_idx').on(table.eventUid)],
)

export const tripOptions = sqliteTable(
  'trip_options',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull(),
    eventUid: text('event_uid').notNull(),
    eventDate: text('event_date').notNull(),
    eventDtstart: integer('event_dtstart', { mode: 'timestamp_ms' }).notNull(),
    stopBeforeAt: integer('stop_before_at', { mode: 'timestamp_ms' }).notNull(),
    lastCapacity: integer('last_capacity'),
    lastCapacityState: text('last_capacity_state'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('trip_options_event_unique').on(table.tripId, table.eventUid),
    uniqueIndex('trip_options_priority_unique').on(table.tripId, table.priority),
    index('trip_options_dtstart_idx').on(table.eventDtstart),
  ],
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    type: text('type').notNull(),
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    payload: text('payload'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('audit_logs_user_created_idx').on(table.userId, table.createdAt),
    index('audit_logs_type_idx').on(table.type),
    index('audit_logs_trip_idx').on(table.tripId),
  ],
)

export const praamidCredentials = sqliteTable(
  'praamid_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
    praamidSub: text('praamid_sub').notNull(),
    sessionSid: text('session_sid'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
    lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('praamid_credentials_expires_at_idx').on(table.expiresAt)],
)

export const praamidCsrfNonces = sqliteTable(
  'praamid_csrf_nonces',
  {
    nonce: text('nonce').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index('praamid_csrf_nonces_user_id_idx').on(table.userId)],
)

export type Setting = typeof settings.$inferSelect
export type PraamidCredential = typeof praamidCredentials.$inferSelect
export type NewPraamidCredential = typeof praamidCredentials.$inferInsert
export type Trip = typeof trips.$inferSelect
export type NewTrip = typeof trips.$inferInsert
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type TripOption = typeof tripOptions.$inferSelect
export type NewTripOption = typeof tripOptions.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

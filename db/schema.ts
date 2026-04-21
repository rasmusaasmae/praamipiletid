import {
  boolean,
  index,
  integer,
  pgTable,
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

export const trips = pgTable(
  'trips',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    measurementUnit: text('measurement_unit').notNull(),
    notify: boolean('notify').default(true).notNull(),
    edit: boolean('edit').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('trips_user_id_idx').on(table.userId)],
)

// user_id is denormalized from trips.user_id so Electric shape `where`
// clauses (which can't join) can scope this table per user.
export const tickets = pgTable(
  'tickets',
  {
    tripId: text('trip_id')
      .primaryKey()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ticketCode: text('ticket_code').notNull(),
    ticketNumber: text('ticket_number').notNull(),
    bookingUid: text('booking_uid').notNull(),
    eventUid: text('event_uid').notNull(),
    ticketDate: text('ticket_date').notNull(),
    eventDtstart: timestamp('event_dtstart', { withTimezone: true, mode: 'date' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('tickets_event_uid_idx').on(table.eventUid),
    index('tickets_user_id_idx').on(table.userId),
  ],
)

// user_id is denormalized from trips.user_id — see tickets comment.
export const tripOptions = pgTable(
  'trip_options',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull(),
    eventUid: text('event_uid').notNull(),
    eventDate: text('event_date').notNull(),
    eventDtstart: timestamp('event_dtstart', { withTimezone: true, mode: 'date' }).notNull(),
    stopBeforeAt: timestamp('stop_before_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastCapacity: integer('last_capacity'),
    lastCapacityState: text('last_capacity_state'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('trip_options_event_unique').on(table.tripId, table.eventUid),
    uniqueIndex('trip_options_priority_unique').on(table.tripId, table.priority),
    index('trip_options_dtstart_idx').on(table.eventDtstart),
    index('trip_options_user_id_idx').on(table.userId),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    type: text('type').notNull(),
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    payload: text('payload'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_user_created_idx').on(table.userId, table.createdAt),
    index('audit_logs_type_idx').on(table.type),
    index('audit_logs_trip_idx').on(table.tripId),
  ],
)

export const praamidCredentials = pgTable(
  'praamid_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
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

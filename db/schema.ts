import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

export * from './auth-schema'

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    date: text('date').notNull(),
    tripUid: text('trip_uid').notNull(),
    departureAt: integer('departure_at', { mode: 'timestamp_ms' }).notNull(),
    capacityType: text('capacity_type').notNull(),
    threshold: integer('threshold').default(1).notNull(),
    renotifyMode: text('renotify_mode').default('once_until_depleted').notNull(),
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    lastNotifiedAt: integer('last_notified_at', { mode: 'timestamp_ms' }),
    lastCapacity: integer('last_capacity'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscriptions_user_id_idx').on(table.userId),
    index('subscriptions_active_idx').on(table.active),
    uniqueIndex('subscriptions_user_trip_capacity_unique').on(
      table.userId,
      table.tripUid,
      table.capacityType,
    ),
  ],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})

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

export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
export type Setting = typeof settings.$inferSelect
export type PraamidCredential = typeof praamidCredentials.$inferSelect
export type NewPraamidCredential = typeof praamidCredentials.$inferInsert

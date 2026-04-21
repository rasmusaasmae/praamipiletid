import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema'

type DB = ReturnType<typeof drizzle<typeof schema>>

let _sql: Sql | null = null
let _db: DB | null = null

function connect() {
  if (_db) return { sql: _sql!, db: _db }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  _sql = postgres(databaseUrl)
  _db = drizzle(_sql, { schema, casing: 'snake_case' })
  return { sql: _sql, db: _db }
}

const sqlTarget = (() => {}) as unknown as Sql
export const sql: Sql = new Proxy(sqlTarget, {
  get(_t, prop) {
    return Reflect.get(connect().sql, prop)
  },
  apply(_t, _this, args) {
    return Reflect.apply(connect().sql as never, _this, args)
  },
})

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    return Reflect.get(connect().db, prop)
  },
})

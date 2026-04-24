import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import * as schema from './schema'

const sql = postgres(getEnv().DATABASE_URL)
export const db = drizzle(sql, { schema, casing: 'snake_case' })

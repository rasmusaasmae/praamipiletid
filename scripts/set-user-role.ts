// Set a user's role from the command line.
//
// Usage:
//   bun run scripts/set-user-role.ts <email> <user|admin>
//
// Inside the running container on the server:
//   docker compose exec app node --import tsx scripts/set-user-role.ts me@example.com admin
//
// Bootstraps the first admin after ADMIN_EMAILS was removed; also useful for
// demoting/promoting later without opening the DB directly.

import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { user } from '../db/auth-schema'

const VALID_ROLES = ['user', 'admin'] as const
type Role = (typeof VALID_ROLES)[number]

function usage(): never {
  console.error('Usage: bun run scripts/set-user-role.ts <email> <user|admin>')
  process.exit(1)
}

const [emailArg, roleArg] = process.argv.slice(2)
if (!emailArg || !roleArg) usage()

const email = emailArg.trim().toLowerCase()
if (!email.includes('@')) {
  console.error(`Invalid email: ${emailArg}`)
  process.exit(1)
}

if (!VALID_ROLES.includes(roleArg as Role)) {
  console.error(`Invalid role: ${roleArg}. Must be one of: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}
const role = roleArg as Role

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(databaseUrl, { max: 1 })
const db = drizzle(sql)

try {
  const [existing] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!existing) {
    console.error(
      `No user with email ${email}. User must sign in at least once before their role can be changed.`,
    )
    process.exit(1)
  }

  if (existing.role === role) {
    console.log(`${email} already has role=${role}. Nothing to do.`)
    process.exit(0)
  }

  await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, existing.id))
  console.log(`${email}: ${existing.role} -> ${role}`)
} finally {
  await sql.end()
}

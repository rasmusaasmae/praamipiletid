import 'server-only'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getEnv } from '@/lib/env'

const env = getEnv()

export const auth = betterAuth({
  baseURL: env.APP_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await db.insert(userSettings).values({ userId: created.id })
        },
      },
    },
  },
})

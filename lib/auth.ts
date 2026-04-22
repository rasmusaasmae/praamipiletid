import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { generateNtfyTopic } from '@/lib/ntfy-topic'

const appUrl = process.env.APP_URL
if (!appUrl) throw new Error('APP_URL is not set')

export const auth = betterAuth({
  baseURL: appUrl,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  plugins: [
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          // Every user gets a user_settings row with a generated ntfy
          // topic the moment they're created, so notifier code can
          // always assume it exists.
          await db.insert(schema.userSettings).values({
            userId: created.id,
            ntfyTopic: generateNtfyTopic(),
          })
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session

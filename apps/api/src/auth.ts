import type { Db } from '@ferry-tickets/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth } from 'better-auth/plugins'

export const POCKET_ID = 'pocket-id'

// Sign-in goes through a self-hosted Pocket ID (OIDC). Pocket ID decides who
// may sign in, through the client's allowed user groups.
// Pocket ID's endpoints are fixed, so they are spelled out rather than
// discovered: discovery runs once at startup, and a Pocket ID that is down
// at that moment would leave sign-in broken until the next restart.
export function createAuth(config: {
  db: Db
  baseURL: string
  secret: string
  pocketId: { url: string; clientId: string; clientSecret: string }
}) {
  const pocketId = config.pocketId.url.replace(/\/$/, '')
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(config.db, { provider: 'pg' }),
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: POCKET_ID,
            clientId: config.pocketId.clientId,
            clientSecret: config.pocketId.clientSecret,
            authorizationUrl: `${pocketId}/authorize`,
            tokenUrl: `${pocketId}/api/oidc/token`,
            userInfoUrl: `${pocketId}/api/oidc/userinfo`,
            scopes: ['openid', 'email', 'profile'],
            pkce: true,
          },
        ],
      }),
    ],
  })
}

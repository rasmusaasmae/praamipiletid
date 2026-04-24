import 'server-only'
import { z } from 'zod'

// Empty `FOO=` lines in .env arrive as '' from process.env. Treat those as
// "not set" so optional schemas don't reject them.
const blankAsUndefined = (v: unknown) => (v === '' ? undefined : v)

const optionalString = z.preprocess(blankAsUndefined, z.string().min(1).optional())

const envSchema = z.object({
  // Always required — the app cannot boot without these.
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),

  // Required for sign-in to actually work, but tolerated as missing so the
  // build can succeed without them and `next build` can collect routes.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Required for outbound mail to work; sendEmail() throws at call time
  // if any are missing, so the app boots either way.
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,

  POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(15_000),

  // 32 bytes hex (64 chars). Optional — when unset the app renders the
  // "not configured" praamid card instead of the auth flow.
  PRAAMID_CRED_KEY: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars')
      .optional(),
  ),

  DISCORD_WEBHOOK_URL: z.preprocess(blankAsUndefined, z.string().url().optional()),
  LOG_LEVEL: z.preprocess(
    blankAsUndefined,
    z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  ),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

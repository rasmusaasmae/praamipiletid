import 'server-only'
import { eq } from 'drizzle-orm'
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from '@/db'
import { user } from '@/db/schema'

// Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM at first
// send. Recipient is resolved from `user.email` (better-auth) by userId.
// Configured for Proton Mail's SMTP submission (smtp.protonmail.ch:587,
// STARTTLS) but works with any submission endpoint that accepts PLAIN auth.

let cached: { transporter: Transporter; from: string } | null = null

function getTransport(): { transporter: Transporter; from: string } {
  if (cached) return cached
  const host = requireEnv('SMTP_HOST')
  const port = Number(process.env.SMTP_PORT ?? 587)
  const smtpUser = requireEnv('SMTP_USER')
  const pass = requireEnv('SMTP_PASS')
  const from = requireEnv('SMTP_FROM')
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: smtpUser, pass },
  })
  cached = { transporter, from }
  return cached
}

export async function sendEmail({
  userId,
  subject,
  body,
}: {
  userId: string
  subject: string
  body: string
}): Promise<void> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row?.email) throw new Error(`sendEmail: no email on user ${userId}`)
  const { transporter, from } = getTransport()
  await transporter.sendMail({
    from,
    to: row.email,
    subject,
    text: body,
  })
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`email: ${name} is not set`)
  return v
}

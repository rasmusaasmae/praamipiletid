import 'server-only'
import { eq } from 'drizzle-orm'
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from '@/db'
import { user } from '@/db/schema'
import { getEnv } from '@/lib/env'

// Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM at first
// send. Recipient is resolved from `user.email` (better-auth) by userId.
// Configured for Proton Mail's SMTP submission (smtp.protonmail.ch:587,
// STARTTLS) but works with any submission endpoint that accepts PLAIN auth.

let cached: { transporter: Transporter; from: string } | null = null

function getTransport(): { transporter: Transporter; from: string } {
  if (cached) return cached
  const env = getEnv()
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error('email: SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM must all be set')
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT === 587,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  cached = { transporter, from: env.SMTP_FROM }
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

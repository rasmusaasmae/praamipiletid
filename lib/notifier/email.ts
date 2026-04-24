import 'server-only'
import { eq } from 'drizzle-orm'
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from '@/db'
import { user } from '@/db/schema'
import type { Notifier, NotificationPayload } from './types'

// Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM at first
// send. Recipient is resolved from `user.email` (better-auth) by userId.
// Configured for Proton Mail's SMTP submission (smtp.protonmail.ch:587,
// STARTTLS) but works with any submission endpoint that accepts PLAIN
// auth.
export class EmailNotifier implements Notifier {
  readonly name = 'email'

  private transporter: Transporter | null = null
  private from: string | null = null

  private getTransport(): { transporter: Transporter; from: string } {
    if (this.transporter && this.from) {
      return { transporter: this.transporter, from: this.from }
    }
    const host = requireEnv('SMTP_HOST')
    const port = Number(process.env.SMTP_PORT ?? 587)
    const smtpUser = requireEnv('SMTP_USER')
    const pass = requireEnv('SMTP_PASS')
    const from = requireEnv('SMTP_FROM')
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user: smtpUser, pass },
    })
    this.from = from
    return { transporter: this.transporter, from }
  }

  async send(payload: NotificationPayload): Promise<void> {
    const [row] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, payload.userId))
      .limit(1)
    if (!row?.email) {
      throw new Error(`email notifier: no email on user ${payload.userId}`)
    }
    const { transporter, from } = this.getTransport()
    await transporter.sendMail({
      from,
      to: row.email,
      subject: payload.title,
      text: payload.message,
    })
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`email notifier: ${name} is not set`)
  return v
}

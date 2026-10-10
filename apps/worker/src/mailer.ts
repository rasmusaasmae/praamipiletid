import nodemailer from 'nodemailer'

export type Mail = { to: string; subject: string; text: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
}

// Records mail instead of sending it.
export function createFakeMailer() {
  const sent: Mail[] = []
  return {
    sent,
    async send(mail: Mail) {
      sent.push(mail)
    },
  }
}

// SMTP submission, e.g. Proton Mail (smtp.protonmail.ch:587, STARTTLS).
export function createSmtpMailer(config: {
  host: string
  port: number
  user: string
  pass: string
  from: string
}): Mailer {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: { user: config.user, pass: config.pass },
  })
  return {
    async send(mail) {
      await transporter.sendMail({ from: config.from, ...mail })
    },
  }
}

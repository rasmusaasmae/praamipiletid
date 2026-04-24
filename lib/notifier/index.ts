import 'server-only'
import { EmailNotifier } from './email'
import type { Notifier } from './types'

export type { Notifier, NotificationPayload } from './types'

let instance: Notifier | null = null

export function getNotifier(): Notifier {
  if (instance) return instance
  const backend = (process.env.NOTIFIER ?? 'email').toLowerCase()
  switch (backend) {
    case 'email':
      instance = new EmailNotifier()
      break
    default:
      throw new Error(`Unknown NOTIFIER backend: ${backend}`)
  }
  return instance
}

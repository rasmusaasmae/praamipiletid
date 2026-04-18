import 'server-only'
import { NtfyNotifier } from './ntfy'
import type { Notifier } from './types'

export type { Notifier, NotificationPayload } from './types'

let instance: Notifier | null = null

export function getNotifier(): Notifier {
  if (instance) return instance
  const backend = (process.env.NOTIFIER ?? 'ntfy').toLowerCase()
  switch (backend) {
    case 'ntfy':
      instance = new NtfyNotifier()
      break
    default:
      throw new Error(`Unknown NOTIFIER backend: ${backend}`)
  }
  return instance
}

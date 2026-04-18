import type { Notifier, NotificationPayload } from './types'

export class NtfyNotifier implements Notifier {
  readonly name = 'ntfy'

  constructor(private baseUrl: string = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh') {}

  async send(payload: NotificationPayload): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(payload.userTopic)}`
    const headers: Record<string, string> = {
      Title: payload.title,
    }
    if (payload.tag) headers.Tags = payload.tag
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: payload.message,
    })
    if (!res.ok) {
      throw new Error(`ntfy ${res.status}: ${await res.text()}`)
    }
  }
}

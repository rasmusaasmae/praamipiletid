export type NotificationPayload = {
  userId: string
  title: string
  message: string
}

export interface Notifier {
  readonly name: string
  send(payload: NotificationPayload): Promise<void>
}

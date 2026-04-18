export type NotificationPayload = {
  userId: string
  userTopic: string
  title: string
  message: string
  tag?: string
}

export interface Notifier {
  readonly name: string
  send(payload: NotificationPayload): Promise<void>
}

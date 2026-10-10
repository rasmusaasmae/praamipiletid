import { USER_CHANGED_CHANNEL, type Db } from '@praamipiletid/db'

// Fans Postgres change notifications out to the open pages of each user.
export function createChangeFeed(db: Db) {
  const subscribers = new Map<string, Set<() => void>>()
  let listening: Promise<unknown> | null = null

  return {
    async subscribe(userId: string, onChange: () => void): Promise<() => void> {
      listening ??= db.client.listen(USER_CHANGED_CHANNEL, (id) => {
        for (const notify of subscribers.get(id) ?? []) notify()
      })
      await listening
      const own = subscribers.get(userId) ?? new Set()
      own.add(onChange)
      subscribers.set(userId, own)
      return () => {
        own.delete(onChange)
        if (own.size === 0) subscribers.delete(userId)
      }
    },
  }
}

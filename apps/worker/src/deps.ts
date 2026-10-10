import type { Db } from '@praamipiletid/db'
import type { Praamid } from '@praamipiletid/praamidee'

import type { Mailer } from './mailer'

export type WorkerDeps = {
  db: Db
  praamid: Praamid
  mailer: Mailer
  // Postgres that DBOS keeps its workflow state in.
  databaseUrl: string
  // DBOS's own log level; tests quiet it.
  logLevel?: string
}

// DBOS registers workflows once per process, so they reach their
// dependencies through here rather than through arguments.
let current: WorkerDeps | null = null

export function setDeps(next: WorkerDeps): void {
  current = next
}

export function deps(): WorkerDeps {
  if (!current) throw new Error('worker dependencies not set')
  return current
}

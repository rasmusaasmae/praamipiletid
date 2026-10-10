import { DBOS } from '@dbos-inc/dbos-sdk'

import { claim, findSwaps, syncStaleUsers } from './cycle'
import { setDeps, type WorkerDeps } from './deps'
import { swapWorkflow } from './swap'

export type { WorkerDeps } from './deps'

export async function createWorker(deps: WorkerDeps) {
  setDeps(deps)
  DBOS.setConfig({
    name: 'praamipiletid',
    systemDatabaseUrl: deps.databaseUrl,
    logLevel: deps.logLevel ?? 'info',
  })
  await DBOS.launch()

  const running = new Set<Promise<unknown>>()

  return {
    // One pass: confirm tickets exist, check availability, schedule swaps.
    async runCycle(now: Date): Promise<void> {
      const { db, praamid } = deps
      await syncStaleUsers(db, praamid, now)
      for (const plan of await findSwaps(db, praamid, now)) {
        if (!(await claim(db, plan.ticketId, now))) continue
        const handle = await DBOS.startWorkflow(swapWorkflow, {
          workflowID: `swap-${plan.ticketId}-${now.getTime()}`,
        })({
          userId: plan.userId,
          ticketCode: plan.ticketCode,
          bookingUid: plan.bookingUid,
          target: plan.target,
          now: now.toISOString(),
        })
        const result = handle.getResult().finally(() => running.delete(result))
        running.add(result)
      }
    },

    // Resolves once every swap this worker started, or recovered after a
    // restart, has finished.
    async drain(): Promise<void> {
      const pending = await DBOS.listWorkflows({ status: ['PENDING', 'ENQUEUED'] })
      await Promise.allSettled([
        ...running,
        ...pending.map((w) => DBOS.retrieveWorkflow(w.workflowID).getResult()),
      ])
    },

    async shutdown(): Promise<void> {
      await DBOS.shutdown()
    },
  }
}

export type Worker = Awaited<ReturnType<typeof createWorker>>

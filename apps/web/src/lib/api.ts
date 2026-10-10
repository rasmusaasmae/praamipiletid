import type { App } from '@ferry-tickets/api/app'
import type { AuthInfo, PraamidEvent } from '@ferry-tickets/praamidee'
import { queryOptions } from '@tanstack/react-query'
import { hc, type InferResponseType } from 'hono/client'

const client = hc<App>('/').api

type TicketsJson = InferResponseType<typeof client.tickets.$get>

// Dates arrive as ISO strings; the UI works with Date objects.
function withDates(json: TicketsJson) {
  return json.map(({ ticket, options }) => ({
    ticket: { ...ticket, eventDtstart: new Date(ticket.eventDtstart) },
    options: options.map((o) => ({ ...o, eventDtstart: new Date(o.eventDtstart) })),
  }))
}

export type TicketWithOptions = ReturnType<typeof withDates>[number]
export type { PraamidEvent }

async function ok<T extends Response>(res: T): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(ERROR_MESSAGES[body?.error ?? ''] ?? `Request failed (${res.status})`)
  }
  return res
}

const ERROR_MESSAGES: Record<string, string> = {
  current_event: 'That departure is already your ticket.',
  duplicate_option: 'That departure is already an alternative.',
  event_not_found: 'That departure no longer exists.',
  ticket_not_found: 'Ticket not found.',
  option_not_found: 'Alternative not found.',
}

export const ticketsQuery = queryOptions({
  queryKey: ['tickets'],
  queryFn: async () => withDates(await (await ok(await client.tickets.$get())).json()),
})

export const praamidLoginQuery = queryOptions({
  queryKey: ['praamidLogin'],
  queryFn: async (): Promise<AuthInfo> => {
    const json = await (await ok(await client.praamid.login.$get())).json()
    const date = (v: string | null) => (v ? new Date(v) : null)
    return {
      ...json,
      capturedAt: date(json.capturedAt),
      expiresAt: date(json.expiresAt),
      lastVerifiedAt: date(json.lastVerifiedAt),
    }
  },
})

export const departuresQuery = (ticketId: number, date: string) =>
  queryOptions({
    queryKey: ['departures', ticketId, date],
    // praamid.ee is either up or not; say so quickly rather than retry long.
    retry: 1,
    queryFn: async () => {
      const res = await ok(
        await client.tickets[':ticketId'].departures.$get({
          param: { ticketId: String(ticketId) },
          query: { date },
        }),
      )
      // ok() has ruled out the validation-error bodies in the union.
      return (await res.json()) as PraamidEvent[]
    },
  })

export const api = {
  addOption: async (ticketId: number, eventUid: string, date: string) => {
    await ok(
      await client.tickets[':ticketId'].options.$post({
        param: { ticketId: String(ticketId) },
        json: { eventUid, date },
      }),
    )
  },
  setCutoff: async (id: string, stopBeforeMinutes: number) => {
    await ok(await client.options[':id'].$patch({ param: { id }, json: { stopBeforeMinutes } }))
  },
  moveOption: async (id: string, direction: 'up' | 'down') => {
    await ok(await client.options[':id'].move.$post({ param: { id }, json: { direction } }))
  },
  removeOption: async (id: string) => {
    await ok(await client.options[':id'].$delete({ param: { id } }))
  },
  startPraamidLogin: async (isikukood: string) => {
    await ok(await client.praamid.login.$post({ json: { isikukood } }))
  },
  cancelPraamidLogin: async () => {
    await ok(await client.praamid.login.cancel.$post())
  },
  forgetPraamidLogin: async () => {
    await ok(await client.praamid.login.$delete())
  },
}

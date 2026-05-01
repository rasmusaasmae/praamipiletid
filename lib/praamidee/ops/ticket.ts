import 'server-only'
import { authedFetch, authedRequest, type ApiList } from '../client'
import { PraamidAuthError } from '../errors'
import type { EditTicketBody, Ticket } from '../types'

export async function listTickets(userId: string): Promise<Ticket[]> {
  const data = await authedFetch<ApiList<Ticket>>(userId, '/tickets')
  return data.items
}

export async function editTicket(
  userId: string,
  oldTicketCode: string,
  body: EditTicketBody,
): Promise<void> {
  const res = await authedRequest(userId, `/tickets/${encodeURIComponent(oldTicketCode)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status !== 204) {
    throw new PraamidAuthError(
      res.status,
      `PUT /online/tickets/${oldTicketCode}`,
      `expected 204, got ${res.status}`,
    )
  }
}

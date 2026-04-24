'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { tickets, user } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { pollIntervalNumberSchema, userRoleSchema } from '@/lib/schemas'
import { requireAdmin } from '@/lib/session'
import { setSetting } from '@/lib/settings'

const UpdatePollIntervalDto = z.object({ pollIntervalMs: pollIntervalNumberSchema })

export async function updatePollInterval(
  dto: z.input<typeof UpdatePollIntervalDto>,
): Promise<void> {
  await requireAdmin()
  const parsed = UpdatePollIntervalDto.safeParse(dto)
  if (!parsed.success) throw new Error('Value must be 5000..600000 ms')
  await setSetting('pollIntervalMs', parsed.data.pollIntervalMs)
  revalidatePath('/admin')
}

const SetEditGloballyEnabledDto = z.object({ enabled: z.boolean() })

export async function setEditGloballyEnabled(
  dto: z.input<typeof SetEditGloballyEnabledDto>,
): Promise<void> {
  await requireAdmin()
  const parsed = SetEditGloballyEnabledDto.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')
  await setSetting('editGloballyEnabled', parsed.data.enabled ? 1 : 0)
  revalidatePath('/admin')
}

const UpdateUserRoleDto = z.object({
  userId: z.string().min(1),
  role: userRoleSchema,
})

export async function updateUserRole(dto: z.input<typeof UpdateUserRoleDto>): Promise<void> {
  await requireAdmin()
  const parsed = UpdateUserRoleDto.safeParse(dto)
  if (!parsed.success) throw new Error('Invalid data')
  await db.update(user).set({ role: parsed.data.role }).where(eq(user.id, parsed.data.userId))
  revalidatePath('/admin')
}

const DeleteAnyTicketDto = z.object({
  userId: z.string().min(1),
  bookingUid: z.string().min(1),
})

export async function deleteAnyTicket(dto: z.input<typeof DeleteAnyTicketDto>): Promise<void> {
  const session = await requireAdmin()
  const parsed = DeleteAnyTicketDto.safeParse(dto)
  if (!parsed.success) throw new Error('Missing id')
  const [target] = await db
    .select({ ticketCode: tickets.ticketCode })
    .from(tickets)
    .where(
      and(eq(tickets.userId, parsed.data.userId), eq(tickets.bookingUid, parsed.data.bookingUid)),
    )
    .limit(1)
  if (!target) throw new Error('Ticket not found')
  await db
    .delete(tickets)
    .where(
      and(eq(tickets.userId, parsed.data.userId), eq(tickets.bookingUid, parsed.data.bookingUid)),
    )
  await logAudit({
    type: 'ticket.unsubscribed',
    actor: 'user',
    userId: session.user.id,
    payload: {
      bookingUid: parsed.data.bookingUid,
      ticketCode: target.ticketCode,
      reason: 'admin',
    },
  })
  revalidatePath('/admin')
}

import { z } from 'zod'

export const directionSchema = z.enum(['VK', 'KV', 'RH', 'HR'])
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const isikukoodSchema = z.string().regex(/^\d{11}$/, 'isikukoodInvalid')

export const subscribeTicketSchema = z.object({
  bookingUid: z.string().min(1),
  ticketCode: z.string().min(1),
})

export const unsubscribeTicketSchema = z.object({
  bookingUid: z.string().min(1),
})

export const optionAddSchema = z.object({
  bookingUid: z.string().min(1),
  eventUid: z.string().min(1),
  date: dateSchema,
  stopBeforeMinutes: z.coerce.number().int().min(0).optional(),
})

export const optionUpdateSchema = z.object({
  id: z.string().min(1),
  stopBeforeMinutes: z.coerce.number().int().min(0),
})

export const optionMoveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(['up', 'down']),
})

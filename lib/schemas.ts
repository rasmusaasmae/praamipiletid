import { z } from 'zod'

export const directionSchema = z.enum(['VK', 'KV', 'RH', 'HR'])
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const isikukoodSchema = z.string().regex(/^\d{11}$/, 'isikukoodInvalid')

export const tripCreateSchema = z.object({
  direction: directionSchema,
  measurementUnit: z.string().min(1),
  notify: z.coerce.boolean().optional(),
  edit: z.coerce.boolean().optional(),
})

export const tripUpdateSchema = z.object({
  id: z.string().min(1),
  notify: z.coerce.boolean().optional(),
  edit: z.coerce.boolean().optional(),
})

export const optionAddSchema = z.object({
  tripId: z.string().min(1),
  eventUid: z.string().min(1),
  date: dateSchema,
  stopBeforeAt: z.coerce.number().int().optional(),
})

export const optionUpdateSchema = z.object({
  id: z.string().min(1),
  stopBeforeAt: z.coerce.number().int(),
})

export const optionMoveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(['up', 'down']),
})

export const pollIntervalRange = { min: 5_000, max: 600_000 } as const
export const pollIntervalNumberSchema = z
  .number()
  .int()
  .min(pollIntervalRange.min)
  .max(pollIntervalRange.max)
export const pollIntervalSchema = z.coerce
  .number()
  .int()
  .min(pollIntervalRange.min)
  .max(pollIntervalRange.max)

export const userRoleSchema = z.enum(['user', 'admin'])

export const ntfyTopicSchema = z
  .string()
  .min(4, 'topicMin')
  .max(64, 'topicMax')
  .regex(/^[A-Za-z0-9_-]+$/, 'topicPattern')

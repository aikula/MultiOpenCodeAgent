import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100).optional(),
  inviteCode: z.string().min(4).max(100),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const createSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  source: z.enum(['web', 'telegram', 'system']).default('web'),
})

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(10000),
})

export const createReminderSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  remindAt: z.string().datetime(),
  timezone: z.string().default('Europe/Vilnius'),
  channel: z.enum(['telegram', 'web', 'both']).default('telegram'),
})

export const createCalendarEventSchema = z.object({
  title: z.string().min(1).max(500),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
})

export const updateSettingsSchema = z.object({
  displayName: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  responseStyle: z.string().max(50).optional(),
  defaultAgent: z.string().nullable().optional(),
  defaultModel: z.string().nullable().optional(),
})

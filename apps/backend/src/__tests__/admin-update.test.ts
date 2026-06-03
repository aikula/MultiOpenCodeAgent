import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const adminUpdateUserSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'blocked', 'pending']).optional(),
  dailyQuotaLimit: z.number().int().min(0).max(10000).optional(),
  language: z.string().max(10).optional(),
  responseStyle: z.string().max(50).optional(),
}).strict()

describe('Admin PATCH allowlist schema', () => {
  it('allows valid status update', () => {
    const result = adminUpdateUserSchema.safeParse({ status: 'blocked' })
    expect(result.success).toBe(true)
  })

  it('allows valid quota update', () => {
    const result = adminUpdateUserSchema.safeParse({ dailyQuotaLimit: 50 })
    expect(result.success).toBe(true)
  })

  it('allows valid role update', () => {
    const result = adminUpdateUserSchema.safeParse({ role: 'admin' })
    expect(result.success).toBe(true)
  })

  it('rejects passwordHash', () => {
    const result = adminUpdateUserSchema.safeParse({ passwordHash: 'newhash' })
    expect(result.success).toBe(false)
  })

  it('rejects id', () => {
    const result = adminUpdateUserSchema.safeParse({ id: 'new-id' })
    expect(result.success).toBe(false)
  })

  it('rejects email', () => {
    const result = adminUpdateUserSchema.safeParse({ email: 'new@email.com' })
    expect(result.success).toBe(false)
  })

  it('rejects createdAt', () => {
    const result = adminUpdateUserSchema.safeParse({ createdAt: '2025-01-01' })
    expect(result.success).toBe(false)
  })

  it('rejects welcomeQuotaGranted', () => {
    const result = adminUpdateUserSchema.safeParse({ welcomeQuotaGranted: 100 })
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields', () => {
    const result = adminUpdateUserSchema.safeParse({ evil: 'payload' })
    expect(result.success).toBe(false)
  })
})

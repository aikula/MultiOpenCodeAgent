import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { users, quotaLedger, telegramLinks, auditLog, inviteCodes } from '../db/schema.js'
import { adminMiddleware } from '../middleware/auth.js'
import { grantQuota } from '../services/quota.js'
import { createInviteCode } from '../services/invites.js'

const adminUpdateUserSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'blocked', 'pending']).optional(),
  dailyQuotaLimit: z.number().int().min(0).max(10000).optional(),
  language: z.string().max(10).optional(),
  responseStyle: z.string().max(50).optional(),
}).strict()

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      language: users.language,
      dailyQuotaLimit: users.dailyQuotaLimit,
      createdAt: users.createdAt,
    })
      .from(users)
      .all()
  })

  app.post('/api/admin/users', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { email, password, displayName, role } = request.body as {
      email: string; password: string; displayName?: string; role?: string
    }

    const id = uuid()
    const now = new Date().toISOString()
    const bcrypt = await import('bcryptjs')

    db.insert(users).values({
      id,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName: displayName ?? null,
      role: (role as 'user' | 'admin') ?? 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    return { id, email }
  })

  app.patch('/api/admin/users/:id', {
    preHandler: [adminMiddleware],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    let parsed: z.infer<typeof adminUpdateUserSchema>
    try {
      parsed = adminUpdateUserSchema.parse(request.body)
    } catch (err: any) {
      return reply.status(400).send({ error: 'Invalid fields', details: err.errors })
    }

    const target = db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()
    if (!target) return reply.status(404).send({ error: 'User not found' })

    const updates: Record<string, any> = { ...parsed, updatedAt: new Date().toISOString() }
    if (updates.displayName === null) updates.displayName = null

    db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .run()

    db.insert(auditLog).values({
      id: uuid(),
      actorUserId: request.user.userId,
      action: 'admin_user_updated',
      targetType: 'user',
      targetId: id,
      metadataJson: JSON.stringify(parsed),
      createdAt: new Date().toISOString(),
    }).run()

    return { ok: true }
  })

  app.post('/api/admin/users/:id/quota', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { amount, reason } = request.body as { amount: number; reason: string }

    grantQuota(id, amount, reason, { grantedBy: request.user.userId })

    db.insert(auditLog).values({
      id: uuid(),
      actorUserId: request.user.userId,
      action: 'quota_granted',
      targetType: 'user',
      targetId: id,
      metadataJson: JSON.stringify({ amount, reason }),
      createdAt: new Date().toISOString(),
    }).run()

    return { ok: true }
  })

  app.post('/api/admin/users/:id/telegram-link', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { telegramUserId, telegramUsername } = request.body as {
      telegramUserId: string; telegramUsername?: string
    }

    const linkId = uuid()
    const now = new Date().toISOString()

    db.insert(telegramLinks).values({
      id: linkId,
      userId: id,
      telegramUserId,
      telegramUsername: telegramUsername ?? null,
      linkedAt: now,
      isActive: true,
    }).run()

    return { ok: true, linkId }
  })

  app.get('/api/admin/audit', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { limit, offset, action } = request.query as { limit?: string; offset?: string; action?: string }

    const appliedLimit = Math.min(parseInt(limit ?? '100'), 500)
    const appliedOffset = parseInt(offset ?? '0')

    if (action) {
      return db.select().from(auditLog)
        .where(eq(auditLog.action, action))
        .limit(appliedLimit)
        .offset(appliedOffset)
        .all()
    }

    return db.select().from(auditLog)
      .limit(appliedLimit)
      .offset(appliedOffset)
      .all()
  })

  // Invite code management
  app.get('/api/admin/invites', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select({
      id: inviteCodes.id,
      label: inviteCodes.label,
      status: inviteCodes.status,
      maxUses: inviteCodes.maxUses,
      usedCount: inviteCodes.usedCount,
      expiresAt: inviteCodes.expiresAt,
      createdByUserId: inviteCodes.createdByUserId,
      createdAt: inviteCodes.createdAt,
    })
      .from(inviteCodes)
      .all()
  })

  const createInviteSchema = z.object({
    label: z.string().max(200).optional(),
    maxUses: z.number().int().min(1).max(10000).default(1),
    expiresAt: z.string().datetime().optional(),
  })

  app.post('/api/admin/invites', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const input = createInviteSchema.parse(request.body)
    const result = createInviteCode({
      label: input.label,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      createdByUserId: request.user.userId,
    })
    return { id: result.id, code: result.plainCode, label: input.label }
  })

  app.patch('/api/admin/invites/:id', {
    preHandler: [adminMiddleware],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, label } = request.body as { status?: string; label?: string }

    const code = db.select().from(inviteCodes).where(eq(inviteCodes.id, id)).get()
    if (!code) return reply.status(404).send({ error: 'Not found' })

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() }
    if (status) updates.status = status
    if (label !== undefined) updates.label = label

    db.update(inviteCodes).set(updates).where(eq(inviteCodes.id, id)).run()
    return { ok: true }
  })

  app.post('/api/admin/invites/:id/disable', {
    preHandler: [adminMiddleware],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const code = db.select().from(inviteCodes).where(eq(inviteCodes.id, id)).get()
    if (!code) return reply.status(404).send({ error: 'Not found' })

    db.update(inviteCodes)
      .set({ status: 'disabled', updatedAt: new Date().toISOString() })
      .where(eq(inviteCodes.id, id))
      .run()
    return { ok: true }
  })
}

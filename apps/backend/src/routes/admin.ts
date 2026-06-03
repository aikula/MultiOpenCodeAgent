import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { users, quotaLedger, telegramLinks, auditLog } from '../db/schema.js'
import { adminMiddleware } from '../middleware/auth.js'
import { grantQuota } from '../services/quota.js'

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

    let query = db.select().from(auditLog)
      .limit(Math.min(parseInt(limit ?? '100'), 500))
      .offset(parseInt(offset ?? '0'))

    if (action) {
      const { sql, eq } = await import('drizzle-orm')
      query = query.where(eq(auditLog.action, action))
    }

    return query.all()
  })
}

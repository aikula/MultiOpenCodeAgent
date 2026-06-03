import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { users, quotaLedger, telegramLinks } from '../db/schema.js'
import { adminMiddleware } from '../middleware/auth.js'
import { grantQuota } from '../services/quota.js'

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
    const { hashSync } = await import('bcryptjs')

    db.insert(users).values({
      id,
      email,
      passwordHash: hashSync(password, 12),
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
  }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, any>

    db.update(users)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(users.id, id))
      .run()

    return { ok: true }
  })

  app.post('/api/admin/users/:id/quota', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { amount, reason } = request.body as { amount: number; reason: string }

    grantQuota(id, amount, reason, { grantedBy: request.user.userId })

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
  }, async () => {
    return db.select()
      .from(quotaLedger)
      .limit(100)
      .all()
  })
}

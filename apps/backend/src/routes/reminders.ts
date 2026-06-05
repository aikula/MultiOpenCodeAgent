import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { reminders } from '../db/schema.js'
import { createReminderSchema } from '@moca/shared/validation'

export async function reminderRoutes(app: FastifyInstance) {
  app.get('/api/reminders', {
    preHandler: [app.authenticate],
  }, async (request) => {
    return db.select()
      .from(reminders)
      .where(eq(reminders.userId, request.user.userId))
      .all()
  })

  app.post('/api/reminders', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const body = createReminderSchema.parse(request.body)
    const id = uuid()
    const now = new Date().toISOString()

    db.insert(reminders).values({
      id,
      userId: request.user.userId,
      title: body.title,
      description: body.description ?? null,
      remindAt: body.remindAt,
      timezone: body.timezone,
      channel: body.channel,
      status: 'scheduled',
      createdAt: now,
    }).run()

    return { id, title: body.title, remindAt: body.remindAt, status: 'scheduled' }
  })

  app.patch('/api/reminders/:id', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as { title?: string; description?: string; status?: string }

    const existing = db.select().from(reminders).where(eq(reminders.id, id)).get()
    if (!existing || existing.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.status !== undefined) updates.status = body.status as 'scheduled' | 'sent' | 'cancelled'

    db.update(reminders)
      .set(updates)
      .where(eq(reminders.id, id))
      .run()

    return { ok: true }
  })

  app.delete('/api/reminders/:id', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const existing = db.select().from(reminders).where(eq(reminders.id, id)).get()
    if (!existing || existing.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    db.update(reminders)
      .set({ status: 'cancelled' })
      .where(eq(reminders.id, id))
      .run()

    return { ok: true }
  })
}

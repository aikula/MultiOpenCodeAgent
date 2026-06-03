import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { memoryItems } from '../db/schema.js'

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/api/memory', {
    preHandler: [app.authenticate],
  }, async (request) => {
    return db.select().from(memoryItems)
      .where(eq(memoryItems.userId, request.user.userId))
      .all()
  })

  app.post('/api/memory', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { type, content, sourceSessionId } = request.body as {
      type: 'fact' | 'preference' | 'task_context' | 'decision'
      content: string
      sourceSessionId?: string
    }
    const id = uuid()
    const now = new Date().toISOString()

    db.insert(memoryItems).values({
      id,
      userId: request.user.userId,
      type,
      content,
      sourceSessionId: sourceSessionId ?? null,
      createdAt: now,
      updatedAt: now,
    }).run()

    return { id, type, content }
  })

  app.delete('/api/memory/:id', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const item = db.select().from(memoryItems).where(eq(memoryItems.id, id)).get()
    if (!item || item.userId !== request.user.userId) {
      return { error: 'Not found' }
    }
    db.delete(memoryItems).where(eq(memoryItems.id, id)).run()
    return { ok: true }
  })
}

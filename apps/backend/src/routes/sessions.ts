import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { sessions, messages, workspaces } from '../db/schema.js'
import { opencodeClient } from '../opencode/client.js'
import { getWorkspace } from '../services/workspace.js'
import { sendMessageSchema } from '@moca/shared/validation'

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/api/sessions', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const list = db.select()
      .from(sessions)
      .where(and(eq(sessions.userId, request.user.userId), eq(sessions.status, 'active')))
      .all()
    return list
  })

  app.post('/api/sessions', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const now = new Date().toISOString()
    const id = uuid()

    let opencodeSessionId: string
    try {
      const ocSession = await opencodeClient.createSession({
        workspacePath: ws.path,
        title: (request.body as any)?.title,
      })
      opencodeSessionId = ocSession.id
    } catch (err) {
      opencodeSessionId = `local-${id}`
    }

    db.insert(sessions).values({
      id,
      userId: request.user.userId,
      workspaceId: ws.id,
      opencodeSessionId,
      title: (request.body as any)?.title ?? 'New session',
      isMain: false,
      source: 'web',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    return { id, opencodeSessionId, title: (request.body as any)?.title ?? 'New session' }
  })

  app.get('/api/sessions/:id/messages', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!session || session.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    return db.select().from(messages)
      .where(eq(messages.sessionId, id))
      .all()
  })

  app.post('/api/sessions/:id/messages', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = sendMessageSchema.parse(request.body)

    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!session || session.userId !== request.user.userId) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const msgId = uuid()
    const now = new Date().toISOString()

    db.insert(messages).values({
      id: msgId,
      userId: request.user.userId,
      sessionId: id,
      role: 'user',
      content: body.text,
      channel: 'web',
      createdAt: now,
    }).run()

    let assistantContent = ''
    let ocMessageId: string | null = null

    try {
      const result = await opencodeClient.sendMessage({
        workspacePath: ws.path,
        opencodeSessionId: session.opencodeSessionId,
        text: body.text,
      })
      assistantContent = result.content
      ocMessageId = result.messageId
    } catch (err: any) {
      assistantContent = `OpenCode unavailable: ${err.message}`
    }

    const assistantId = uuid()
    db.insert(messages).values({
      id: assistantId,
      userId: request.user.userId,
      sessionId: id,
      role: 'assistant',
      content: assistantContent,
      channel: 'web',
      opencodeMessageId: ocMessageId,
      createdAt: new Date().toISOString(),
    }).run()

    return { userMessage: msgId, assistantMessage: assistantId, content: assistantContent }
  })

  app.post('/api/sessions/:id/main', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!session || session.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    db.update(sessions)
      .set({ isMain: false })
      .where(eq(sessions.userId, request.user.userId))
      .run()

    db.update(sessions)
      .set({ isMain: true, updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, id))
      .run()

    return { ok: true }
  })

  app.post('/api/sessions/:id/fork', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!session || session.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const newId = uuid()
    const now = new Date().toISOString()

    let newOcId: string
    try {
      const forked = await opencodeClient.forkSession({
        workspacePath: ws.path,
        opencodeSessionId: session.opencodeSessionId,
      })
      newOcId = forked.id
    } catch {
      newOcId = `local-${newId}`
    }

    db.insert(sessions).values({
      id: newId,
      userId: request.user.userId,
      workspaceId: ws.id,
      opencodeSessionId: newOcId,
      title: `Fork of ${session.title ?? 'session'}`,
      isMain: false,
      source: 'web',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    return { id: newId, opencodeSessionId: newOcId }
  })

  app.delete('/api/sessions/:id', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!session || session.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    db.update(sessions)
      .set({ status: 'deleted', updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, id))
      .run()

    return { ok: true }
  })
}

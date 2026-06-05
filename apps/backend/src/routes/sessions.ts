import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { sessions, messages, workspaces } from '../db/schema.js'
import { opencodeClient } from '../opencode/client.js'
import { getWorkspace } from '../services/workspace.js'
import { getBalance, chargeQuota } from '../services/quota.js'
import { processMessageThroughRouter } from '../services/action-router.js'
import { sendMessageSchema } from '@moca/shared/validation'
import { env } from '../env.js'

async function createOpenCodeSession(workspacePath: string, title?: string): Promise<string> {
  const ocSession = await opencodeClient.createSession({ workspacePath, title })
  return ocSession.id
}

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
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const now = new Date().toISOString()
    const id = uuid()
    const title = (request.body as { title?: string })?.title ?? 'New session'

    let opencodeSessionId: string
    try {
      opencodeSessionId = await createOpenCodeSession(ws.path, title)
    } catch (err: any) {
      if (env.ALLOW_LOCAL_OPENCODE_FALLBACK) {
        opencodeSessionId = `local-${id}`
      } else {
        return reply.status(503).send({ error: `OpenCode unavailable: ${err.message}` })
      }
    }

    db.insert(sessions).values({
      id,
      userId: request.user.userId,
      workspaceId: ws.id,
      opencodeSessionId,
      title,
      isMain: false,
      source: 'web',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    return { id, opencodeSessionId, title }
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

    // Quota check
    const balance = getBalance(request.user.userId)
    if (balance <= 0) {
      return reply.status(429).send({ error: 'Quota exceeded' })
    }

    // Charge quota before processing
    chargeQuota(request.user.userId, 1, 'web_message')

    try {
      const result = await processMessageThroughRouter(request.user.userId, body.text, 'web', id)

      return {
        userMessage: result.userMsgId,
        assistantMessage: result.assistantMsgId,
        content: result.assistantContent,
        sideEffects: result.sideEffects,
        reminderCreated: result.reminderCreated,
      }
    } catch (err: any) {
      chargeQuota(request.user.userId, -1, 'refund_opencode_error')
      return reply.status(500).send({ error: err.message })
    }
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
  }, async (request, reply) => {
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
    } catch (err: any) {
      if (env.ALLOW_LOCAL_OPENCODE_FALLBACK) {
        newOcId = `local-${newId}`
      } else {
        return reply.status(503).send({ error: `OpenCode unavailable: ${err.message}` })
      }
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

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { sessions, messages, auditLog } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { chargeQuota, getBalance } from '../services/quota.js'
import { opencodeClient } from '../opencode/client.js'
import {
  buildDailyPlanContext,
  buildFindContext,
  buildMeetingBrief,
  buildVoiceActionSummary,
} from '../services/manager.js'

const meetingBriefSchema = z.object({
  notes: z.string().min(1).max(100_000),
})

const voiceSummarySchema = z.object({
  transcript: z.string().min(1).max(20_000),
  sendToSession: z.boolean().optional(),
})

const findContextSchema = z.object({
  q: z.string().min(1).max(500),
  sendToSession: z.boolean().optional(),
})

function getMainSessionForUser(userId: string) {
  const list = db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all()
  return list.find(s => s.isMain && s.status === 'active') ?? list.find(s => s.status === 'active')
}

export async function managerRoutes(app: FastifyInstance) {
  app.get('/api/manager/daily-plan', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ctx = buildDailyPlanContext(request.user.userId)
    return ctx
  })

  app.post('/api/manager/daily-plan/run', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const balance = getBalance(request.user.userId)
    if (balance <= 0) {
      return reply.status(429).send({ error: 'Quota exceeded' })
    }
    const ctx = buildDailyPlanContext(request.user.userId)
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })
    const session = getMainSessionForUser(request.user.userId)
    if (!session) return reply.status(400).send({ error: 'No main session' })

    chargeQuota(request.user.userId, 1, 'web_message')
    let content = ''
    try {
      const result = await opencodeClient.sendMessage({
        workspacePath: ws.path,
        opencodeSessionId: session.opencodeSessionId,
        text: ctx.prompt,
        agent: 'daily-plan',
      })
      content = result.content
    } catch (err: any) {
      chargeQuota(request.user.userId, -1, 'refund_opencode_error')
      return reply.status(502).send({ error: `OpenCode error: ${err.message}` })
    }

    const id = uuid()
    db.insert(messages).values({
      id,
      userId: request.user.userId,
      sessionId: session.id,
      role: 'assistant',
      content,
      channel: 'web',
      createdAt: new Date().toISOString(),
    }).run()

    return { content, date: ctx.date }
  })

  app.get('/api/manager/find-context', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { q } = request.query as { q?: string }
    if (!q || q.trim().length === 0) return { query: '', messages: [], memory: [], prompt: '' }
    return buildFindContext(request.user.userId, q)
  })

  app.post('/api/manager/find-context/run', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const body = findContextSchema.parse(request.body)
    const balance = getBalance(request.user.userId)
    if (balance <= 0) {
      return reply.status(429).send({ error: 'Quota exceeded' })
    }
    const ctx = buildFindContext(request.user.userId, body.q)
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })
    const session = getMainSessionForUser(request.user.userId)
    if (!session) return reply.status(400).send({ error: 'No main session' })

    chargeQuota(request.user.userId, 1, 'web_message')
    let content = ''
    try {
      const result = await opencodeClient.sendMessage({
        workspacePath: ws.path,
        opencodeSessionId: session.opencodeSessionId,
        text: ctx.prompt,
        agent: 'find-context',
      })
      content = result.content
    } catch (err: any) {
      chargeQuota(request.user.userId, -1, 'refund_opencode_error')
      return reply.status(502).send({ error: `OpenCode error: ${err.message}` })
    }

    const id = uuid()
    db.insert(messages).values({
      id,
      userId: request.user.userId,
      sessionId: session.id,
      role: 'assistant',
      content,
      channel: 'web',
      createdAt: new Date().toISOString(),
    }).run()

    return { content, query: body.q }
  })

  app.post('/api/manager/meeting-brief', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const body = meetingBriefSchema.parse(request.body)
    return buildMeetingBrief(body.notes)
  })

  app.post('/api/manager/voice-summary', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const body = voiceSummarySchema.parse(request.body)
    return buildVoiceActionSummary(body.transcript)
  })

  app.get('/api/manager/recent', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const list = db
      .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt, sessionId: messages.sessionId })
      .from(messages)
      .where(eq(messages.userId, request.user.userId))
      .orderBy(desc(messages.createdAt))
      .limit(20)
      .all()
    return list
  })
}

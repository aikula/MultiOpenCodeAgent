import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { updateSettingsSchema } from '@moca/shared/validation'

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/me/settings', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const user = db.select().from(users).where(eq(users.id, request.user.userId)).get()
    if (!user) return { error: 'Not found' }

    return {
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      language: user.language,
      responseStyle: user.responseStyle,
      defaultAgent: user.defaultAgent,
      defaultModel: user.defaultModel,
    }
  })

  app.put('/api/me/settings', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const body = updateSettingsSchema.parse(request.body)

    db.update(users)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(users.id, request.user.userId))
      .run()

    return { ok: true }
  })

  app.get('/api/me/agents-md', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    try {
      const content = readFileSync(join(ws.path, 'AGENTS.md'), 'utf-8')
      return { content }
    } catch {
      return { content: '' }
    }
  })

  app.put('/api/me/agents-md', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { content } = request.body as { content: string }
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    writeFileSync(join(ws.path, 'AGENTS.md'), content)
    return { ok: true }
  })
}

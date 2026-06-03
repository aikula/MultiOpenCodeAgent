import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { join } from 'path'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { readFileAsync, writeFileAsync, commitToWorkspace } from '../lib/async-fs.js'
import { updateSettingsSchema } from '@moca/shared/validation'

const MAX_AGENTS_MD_SIZE = 100_000

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
      const content = await readFileAsync(join(ws.path, 'AGENTS.md'))
      return { content }
    } catch {
      return { content: '' }
    }
  })

  app.put('/api/me/agents-md', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { content } = request.body as { content: string }
    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'AGENTS.md cannot be empty' })
    }
    if (content.length > MAX_AGENTS_MD_SIZE) {
      return reply.status(400).send({ error: `AGENTS.md exceeds max size of ${MAX_AGENTS_MD_SIZE} bytes` })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    await writeFileAsync(join(ws.path, 'AGENTS.md'), content)
    await commitToWorkspace(ws.path, 'Update AGENTS.md')

    return { ok: true }
  })
}

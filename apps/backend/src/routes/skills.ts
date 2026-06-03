import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { join } from 'path'
import { db } from '../db/index.js'
import { getWorkspace, assertInsideWorkspace } from '../services/workspace.js'
import { readFileAsync, writeFileAsync, mkdirAsync, rmAsync, readdirAsync, commitToWorkspace } from '../lib/async-fs.js'

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/
const MAX_SKILL_SIZE = 100_000

function validateSlug(slug: string): string | null {
  if (!SKILL_SLUG_RE.test(slug)) return 'Invalid skill slug. Use lowercase letters, digits, and hyphens (2-61 chars).'
  return null
}

export async function skillRoutes(app: FastifyInstance) {
  app.get('/api/skills', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return []

    const skillsDir = join(ws.path, '.opencode', 'skills')
    let userSkills: string[] = []
    try {
      const entries = await readdirAsync(skillsDir, { withFileTypes: true })
      userSkills = entries.filter(d => d.isDirectory()).map(d => d.name)
    } catch {
      // no skills yet
    }

    return userSkills.map(slug => ({ slug, source: 'user' }))
  })

  app.post('/api/skills', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { slug, content } = request.body as { slug: string; content: string }

    const slugError = validateSlug(slug)
    if (slugError) return reply.status(400).send({ error: slugError })

    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Skill content cannot be empty' })
    }
    if (content.length > MAX_SKILL_SIZE) {
      return reply.status(400).send({ error: `Skill content exceeds max size of ${MAX_SKILL_SIZE} bytes` })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const skillDir = join(ws.path, '.opencode', 'skills', slug)
    assertInsideWorkspace(ws.path, skillDir)

    await mkdirAsync(skillDir, { recursive: true })
    await writeFileAsync(join(skillDir, 'SKILL.md'), content)

    await commitToWorkspace(ws.path, `Add skill: ${slug}`)

    return { ok: true, slug }
  })

  app.get('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const slugError = validateSlug(slug)
    if (slugError) return reply.status(400).send({ error: slugError })

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const skillPath = join(ws.path, '.opencode', 'skills', slug, 'SKILL.md')
    assertInsideWorkspace(ws.path, skillPath)

    try {
      const content = await readFileAsync(skillPath)
      return { slug, content, source: 'user' }
    } catch {
      return reply.status(404).send({ error: 'Skill not found' })
    }
  })

  app.put('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { content } = request.body as { content: string }

    const slugError = validateSlug(slug)
    if (slugError) return reply.status(400).send({ error: slugError })

    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Skill content cannot be empty' })
    }
    if (content.length > MAX_SKILL_SIZE) {
      return reply.status(400).send({ error: `Skill content exceeds max size of ${MAX_SKILL_SIZE} bytes` })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const skillPath = join(ws.path, '.opencode', 'skills', slug, 'SKILL.md')
    assertInsideWorkspace(ws.path, skillPath)

    await writeFileAsync(skillPath, content)

    await commitToWorkspace(ws.path, `Update skill: ${slug}`)

    return { ok: true }
  })

  app.delete('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const slugError = validateSlug(slug)
    if (slugError) return reply.status(400).send({ error: slugError })

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const skillDir = join(ws.path, '.opencode', 'skills', slug)
    assertInsideWorkspace(ws.path, skillDir)

    try {
      await rmAsync(skillDir, { recursive: true, force: true })
      await commitToWorkspace(ws.path, `Remove skill: ${slug}`)
    } catch { /* ok */ }

    return { ok: true }
  })
}

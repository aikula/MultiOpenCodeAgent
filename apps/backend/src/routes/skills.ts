import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { getWorkspace, assertInsideWorkspace } from '../services/workspace.js'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/

export async function skillRoutes(app: FastifyInstance) {
  app.get('/api/skills', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return []

    const skillsDir = join(ws.path, '.opencode', 'skills')
    let userSkills: string[] = []
    try {
      const { readdirSync } = await import('fs')
      userSkills = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    } catch {
      // no skills yet
    }

    return userSkills.map(slug => ({ slug, source: 'user' }))
  })

  app.post('/api/skills', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { slug, content } = request.body as { slug: string; content: string }
    if (!SKILL_SLUG_RE.test(slug)) {
      return reply.status(400).send({ error: 'Invalid skill slug' })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const skillDir = join(ws.path, '.opencode', 'skills', slug)
    assertInsideWorkspace(ws.path, skillDir)

    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), content)

    try {
      execSync('git add -A && git commit -m "Add skill: ' + slug + '"', { cwd: ws.path, stdio: 'pipe' })
    } catch {
      // git commit may fail if nothing changed
    }

    return { ok: true, slug }
  })

  app.get('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const skillPath = join(ws.path, '.opencode', 'skills', slug, 'SKILL.md')
    assertInsideWorkspace(ws.path, skillPath)

    try {
      const content = readFileSync(skillPath, 'utf-8')
      return { slug, content, source: 'user' }
    } catch {
      return { error: 'Skill not found' }
    }
  })

  app.put('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const { content } = request.body as { content: string }
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const skillPath = join(ws.path, '.opencode', 'skills', slug, 'SKILL.md')
    assertInsideWorkspace(ws.path, skillPath)

    writeFileSync(skillPath, content)

    try {
      execSync('git add -A && git commit -m "Update skill: ' + slug + '"', { cwd: ws.path, stdio: 'pipe' })
    } catch { /* ok */ }

    return { ok: true }
  })

  app.delete('/api/skills/:slug', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const skillDir = join(ws.path, '.opencode', 'skills', slug)
    assertInsideWorkspace(ws.path, skillDir)

    try {
      rmSync(skillDir, { recursive: true, force: true })
      execSync('git add -A && git commit -m "Remove skill: ' + slug + '"', { cwd: ws.path, stdio: 'pipe' })
    } catch { /* ok */ }

    return { ok: true }
  })
}

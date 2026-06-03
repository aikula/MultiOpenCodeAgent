import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { createHash } from 'crypto'
import { db } from '../db/index.js'
import { skillCatalogs, marketplaceSkills, marketplaceSkillsContent, userInstalledSkills, users, auditLog } from '../db/schema.js'
import { getWorkspace, assertInsideWorkspace } from '../services/workspace.js'
import { scanSkillPackage } from '../services/scanner.js'
import { adminMiddleware } from '../middleware/auth.js'
import { readFileAsync, writeFileAsync, mkdirAsync, commitToWorkspace } from '../lib/async-fs.js'
import { join } from 'path'

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/

function computeSha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function marketplaceRoutes(app: FastifyInstance) {
  app.get('/api/skill-catalogs', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select().from(skillCatalogs).all()
  })

  app.post('/api/skill-catalogs', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { name, sourceType, sourceUrl } = request.body as {
      name: string; sourceType: 'git' | 'json' | 'zip'; sourceUrl?: string
    }
    const id = uuid()
    const now = new Date().toISOString()

    db.insert(skillCatalogs).values({
      id, name, sourceType, sourceUrl: sourceUrl ?? null, status: 'active', createdAt: now,
    }).run()

    return { id, name, status: 'active' }
  })

  app.post('/api/skill-catalogs/import', {
    preHandler: [adminMiddleware],
  }, async (request, reply) => {
    const { catalogId, skills } = request.body as {
      catalogId: string
      skills: Array<{
        slug: string; name: string; description?: string; version?: string
        author?: string; license?: string; sourceUrl?: string; content: string
      }>
    }

    const catalog = db.select().from(skillCatalogs).where(eq(skillCatalogs.id, catalogId)).get()
    if (!catalog) return reply.status(404).send({ error: 'Catalog not found' })

    const results: Array<{ slug: string; status: string }> = []

    for (const skill of skills) {
      if (!SKILL_SLUG_RE.test(skill.slug)) {
        results.push({ slug: skill.slug, status: 'rejected_invalid_slug' })
        continue
      }

      const id = uuid()
      const now = new Date().toISOString()
      const sha256 = computeSha256(skill.content)

      const scanResult = scanSkillPackage({
        skillMd: skill.content,
        filenames: ['SKILL.md'],
      })

      db.insert(marketplaceSkills).values({
        id,
        catalogId,
        slug: skill.slug,
        name: skill.name,
        description: skill.description ?? null,
        version: skill.version ?? null,
        author: skill.author ?? null,
        license: skill.license ?? null,
        sourceUrl: skill.sourceUrl ?? null,
        sha256,
        status: scanResult.status,
        scanReportJson: JSON.stringify(scanResult),
        createdAt: now,
        updatedAt: now,
      }).run()

      db.insert(marketplaceSkillsContent).values({
        id: uuid(),
        marketplaceSkillId: id,
        content: skill.content,
        sha256,
        createdAt: now,
      }).run()

      db.insert(auditLog).values({
        id: uuid(),
        actorUserId: request.user.userId,
        action: 'marketplace_skill_imported',
        targetType: 'marketplace_skill',
        targetId: id,
        metadataJson: JSON.stringify({ slug: skill.slug, status: scanResult.status }),
        createdAt: now,
      }).run()

      results.push({ slug: skill.slug, status: scanResult.status })
    }

    return { imported: results }
  })

  app.post('/api/skill-catalogs/scan', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { skillMd, metadata, filenames } = request.body as {
      skillMd: string; metadata?: Record<string, any>; filenames?: string[]
    }

    return scanSkillPackage({ skillMd, metadata, filenames })
  })

  app.get('/api/marketplace/skills', {
    preHandler: [app.authenticate],
  }, async () => {
    return db.select().from(marketplaceSkills)
      .where(eq(marketplaceSkills.status, 'approved'))
      .all()
  })

  app.patch('/api/marketplace/skills/:id', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: 'approved' | 'rejected' | 'needs_review' }

    db.update(marketplaceSkills)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(marketplaceSkills.id, id))
      .run()

    db.insert(auditLog).values({
      id: uuid(),
      actorUserId: request.user.userId,
      action: 'marketplace_skill_status_changed',
      targetType: 'marketplace_skill',
      targetId: id,
      metadataJson: JSON.stringify({ status }),
      createdAt: new Date().toISOString(),
    }).run()

    return { ok: true }
  })

  app.get('/api/admin/marketplace/skills', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select().from(marketplaceSkills).all()
  })

  app.post('/api/skill-catalogs/:catalogId/skills/:skillId/install', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { skillId } = request.params as { skillId: string }

    const skill = db.select().from(marketplaceSkills).where(eq(marketplaceSkills.id, skillId)).get()
    if (!skill || skill.status !== 'approved') {
      return reply.status(400).send({ error: 'Skill not found or not approved' })
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const contentRow = db.select().from(marketplaceSkillsContent)
      .where(eq(marketplaceSkillsContent.marketplaceSkillId, skillId))
      .get()

    if (!contentRow) {
      return reply.status(500).send({ error: 'Skill content not found' })
    }

    const currentSha = computeSha256(contentRow.content)
    if (currentSha !== contentRow.sha256 || currentSha !== skill.sha256) {
      return reply.status(500).send({ error: 'Skill content integrity check failed' })
    }

    const installDir = join(ws.path, '.opencode', 'skills', 'marketplace', skill.slug)
    assertInsideWorkspace(ws.path, installDir)

    await mkdirAsync(installDir, { recursive: true })

    await writeFileAsync(join(installDir, 'SKILL.md'), contentRow.content)

    await writeFileAsync(join(installDir, 'metadata.json'), JSON.stringify({
      source: skill.sourceUrl ?? 'marketplace',
      version: skill.version,
      author: skill.author,
      sha256: skill.sha256,
      installedAt: new Date().toISOString(),
    }, null, 2))

    await commitToWorkspace(ws.path, `Install marketplace skill: ${skill.slug}`)

    const id = uuid()
    db.insert(userInstalledSkills).values({
      id,
      userId: request.user.userId,
      marketplaceSkillId: skillId,
      installedSlug: skill.slug,
      installedPath: installDir,
      version: skill.version,
      sha256: skill.sha256,
      installedAt: new Date().toISOString(),
      enabled: true,
    }).run()

    db.insert(auditLog).values({
      id: uuid(),
      actorUserId: request.user.userId,
      action: 'marketplace_skill_installed',
      targetType: 'marketplace_skill',
      targetId: skillId,
      metadataJson: JSON.stringify({ slug: skill.slug }),
      createdAt: new Date().toISOString(),
    }).run()

    return { ok: true, slug: skill.slug, installedPath: installDir }
  })

  app.get('/api/marketplace/installed', {
    preHandler: [app.authenticate],
  }, async (request) => {
    return db.select().from(userInstalledSkills)
      .where(eq(userInstalledSkills.userId, request.user.userId))
      .all()
  })
}

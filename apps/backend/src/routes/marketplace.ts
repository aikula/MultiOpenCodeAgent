import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { skillCatalogs, marketplaceSkills, userInstalledSkills, users } from '../db/schema.js'
import { getWorkspace, assertInsideWorkspace } from '../services/workspace.js'
import { scanSkillPackage } from '../services/scanner.js'
import { adminMiddleware } from '../middleware/auth.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export async function marketplaceRoutes(app: FastifyInstance) {
  // List catalogs (admin)
  app.get('/api/skill-catalogs', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select().from(skillCatalogs).all()
  })

  // Add catalog source (admin)
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

  // Import skills from catalog (admin)
  app.post('/api/skill-catalogs/import', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { catalogId, skills } = request.body as {
      catalogId: string
      skills: Array<{
        slug: string; name: string; description?: string; version?: string
        author?: string; license?: string; sourceUrl?: string; content: string
      }>
    }

    const catalog = db.select().from(skillCatalogs).where(eq(skillCatalogs.id, catalogId)).get()
    if (!catalog) return { error: 'Catalog not found' }

    const results: Array<{ slug: string; status: string }> = []

    for (const skill of skills) {
      const id = uuid()
      const now = new Date().toISOString()

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
        status: scanResult.status,
        scanReportJson: JSON.stringify(scanResult),
        createdAt: now,
        updatedAt: now,
      }).run()

      results.push({ slug: skill.slug, status: scanResult.status })
    }

    return { imported: results }
  })

  // Scan a skill (any authenticated user)
  app.post('/api/skill-catalogs/scan', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { skillMd, metadata, filenames } = request.body as {
      skillMd: string; metadata?: Record<string, any>; filenames?: string[]
    }

    return scanSkillPackage({ skillMd, metadata, filenames })
  })

  // List marketplace skills (all authenticated users)
  app.get('/api/marketplace/skills', {
    preHandler: [app.authenticate],
  }, async () => {
    return db.select().from(marketplaceSkills)
      .where(eq(marketplaceSkills.status, 'approved'))
      .all()
  })

  // Admin: approve/reject skill
  app.patch('/api/marketplace/skills/:id', {
    preHandler: [adminMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: 'approved' | 'rejected' | 'needs_review' }

    db.update(marketplaceSkills)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(marketplaceSkills.id, id))
      .run()

    return { ok: true }
  })

  // Admin: list all marketplace skills (including non-approved)
  app.get('/api/admin/marketplace/skills', {
    preHandler: [adminMiddleware],
  }, async () => {
    return db.select().from(marketplaceSkills).all()
  })

  // User: install an approved marketplace skill
  app.post('/api/skill-catalogs/:catalogId/skills/:skillId/install', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { skillId } = request.params as { skillId: string }

    const skill = db.select().from(marketplaceSkills).where(eq(marketplaceSkills.id, skillId)).get()
    if (!skill || skill.status !== 'approved') {
      return { error: 'Skill not found or not approved' }
    }

    const ws = getWorkspace(request.user.userId)
    if (!ws) return { error: 'No workspace' }

    const installDir = join(ws.path, '.opencode', 'skills', 'marketplace', skill.slug)
    assertInsideWorkspace(ws.path, installDir)

    mkdirSync(installDir, { recursive: true })

    const skillContent = `---\nname: ${skill.name}\ndescription: ${skill.description ?? ''}\n---\n\n# ${skill.name}\n\n${skill.description ?? ''}\n`
    writeFileSync(join(installDir, 'SKILL.md'), skillContent)

    if (skill.sourceUrl) {
      writeFileSync(join(installDir, 'metadata.json'), JSON.stringify({
        source: skill.sourceUrl, version: skill.version, author: skill.author,
      }, null, 2))
    }

    try {
      execSync('git add -A && git commit -m "Install marketplace skill: ' + skill.slug + '"', { cwd: ws.path, stdio: 'pipe' })
    } catch { /* ok */ }

    const id = uuid()
    db.insert(userInstalledSkills).values({
      id,
      userId: request.user.userId,
      marketplaceSkillId: skillId,
      installedSlug: skill.slug,
      installedPath: installDir,
      version: skill.version,
      installedAt: new Date().toISOString(),
      enabled: true,
    }).run()

    return { ok: true, slug: skill.slug, installedAt: installDir }
  })

  // User: list installed marketplace skills
  app.get('/api/marketplace/installed', {
    preHandler: [app.authenticate],
  }, async (request) => {
    return db.select().from(userInstalledSkills)
      .where(eq(userInstalledSkills.userId, request.user.userId))
      .all()
  })
}

import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, createWriteStream, rmSync as rmSyncFs } from 'fs'
import { join, resolve } from 'path'
import { pipeline } from 'stream/promises'
import { db } from '../db/index.js'
import { users, workspaces } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '../middleware/auth.js'
import { validateSkillMd, formatPlainTextAsSkill } from '../services/skill-format.js'
import { runSkillStartupCheck } from '../services/skill-startup-check.js'
import { getWorkspace } from '../services/workspace.js'
import { env } from '../env.js'
import { execFileSync } from 'child_process'
import { rmSync } from 'fs'

function extractZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'pipe' })
  } catch (err: any) {
    throw new Error(`ZIP extraction failed: ${err.message}`)
  }

  // ZipSlip protection: remove any extracted files outside destDir
  const resolvedDest = resolve(destDir)
  function validateDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const resolved = resolve(full)
      if (!resolved.startsWith(resolvedDest + '/') && resolved !== resolvedDest) {
        rmSyncFs(resolved, { recursive: true, force: true })
        continue
      }
      if (entry.isDirectory()) validateDir(full)
    }
  }
  validateDir(destDir)
}

const GLOBAL_SKILLS_DIR = env.OPENCODE_SKILLS_DIR || join(env.WORKSPACES_ROOT, '..', 'opencode-config', 'skills')

function ensureGlobalDir() {
  mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true })
}

function findAndInstallSkills(dir: string, skillsDir: string): { installed: string[]; rejected: string[] } {
  const installed: string[] = []
  const rejected: string[] = []

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue
      if (entry.isDirectory()) {
        const skillFile = join(full, 'SKILL.md')
        if (existsSync(skillFile)) {
          const content = readFileSync(skillFile, 'utf-8')
          const validation = validateSkillMd(content)
          if (validation.valid && validation.name) {
            const dest = join(skillsDir, validation.name)
            mkdirSync(dest, { recursive: true })
            writeFileSync(join(dest, 'SKILL.md'), content)
            installed.push(validation.name)
          } else {
            rejected.push(`${entry.name}: ${validation.errors.map(e => e.message).join(', ')}`)
          }
        } else {
          walk(full)
        }
      }
    }
  }
  walk(dir)
  return { installed, rejected }
}

export async function skillUploadRoutes(app: FastifyInstance) {
  app.post('/api/skills/format', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { name, description, plainText } = request.body as { name: string; description: string; plainText: string }
    if (!name || !description || !plainText) {
      return { error: 'name, description and plainText are required' }
    }
    const result = formatPlainTextAsSkill(name, description, plainText)
    if (result.valid && result.normalizedContent) {
      return { content: result.normalizedContent, validation: { valid: true, errors: [] } }
    }
    return { content: null, validation: { valid: false, errors: result.errors } }
  })

  app.post('/api/skills/upload-archive', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    const ws = getWorkspace((request.user as any).userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const tmpDir = join(env.WORKSPACES_ROOT, '..', 'tmp', `upload-${uuid()}`)
    mkdirSync(tmpDir, { recursive: true })
    const zipPath = join(tmpDir, 'upload.zip')

    try {
      await pipeline(data.file, createWriteStream(zipPath))
      const extractDir = join(tmpDir, 'extracted')
      extractZip(zipPath, extractDir)

      const skillsDir = join(ws.path, '.opencode', 'skills')
      mkdirSync(skillsDir, { recursive: true })

      const { installed, rejected } = findAndInstallSkills(extractDir, skillsDir)
      return { installed, rejected }
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  app.post('/api/admin/skills/upload-archive', {
    preHandler: [adminMiddleware],
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    const fields = data.fields as Record<string, any>
    const scope = fields?.scope?.value ?? 'global'
    const targetUserId = fields?.targetUserId?.value

    const tmpDir = join(env.WORKSPACES_ROOT, '..', 'tmp', `admin-upload-${uuid()}`)
    mkdirSync(tmpDir, { recursive: true })
    const zipPath = join(tmpDir, 'upload.zip')

    try {
      await pipeline(data.file, createWriteStream(zipPath))
      const extractDir = join(tmpDir, 'extracted')
      extractZip(zipPath, extractDir)

      let skillsDir: string
      if (scope === 'global') {
        ensureGlobalDir()
        skillsDir = GLOBAL_SKILLS_DIR
      } else if (scope === 'user' && targetUserId) {
        const ws = db.select().from(workspaces).where(eq(workspaces.userId, targetUserId)).get()
        if (!ws) return reply.status(404).send({ error: 'Target user workspace not found' })
        skillsDir = join(ws.path, '.opencode', 'skills')
        mkdirSync(skillsDir, { recursive: true })
      } else {
        return reply.status(400).send({ error: 'Invalid scope or missing targetUserId' })
      }

      const { installed, rejected } = findAndInstallSkills(extractDir, skillsDir)
      return { scope, installed, rejected }
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  app.get('/api/admin/skills/startup-check', {
    preHandler: [adminMiddleware],
  }, async () => {
    return runSkillStartupCheck()
  })
}

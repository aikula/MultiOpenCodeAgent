import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { validateSkillMd } from './skill-format.js'
import { env } from '../env.js'
import { db } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { users, workspaces } from '../db/schema.js'

export interface SkillCheckItem {
  name: string
  valid: boolean
  errors: string[]
}

export interface SkillStartupCheckResult {
  global: SkillCheckItem[]
  users: Array<{ userId: string; skills: SkillCheckItem[] }>
  ok: boolean
}

function checkSkillsDir(dir: string): SkillCheckItem[] {
  if (!existsSync(dir)) return []

  const results: SkillCheckItem[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillFile = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillFile)) {
        results.push({ name: entry.name, valid: false, errors: ['Missing SKILL.md'] })
        continue
      }
      try {
        const content = readFileSync(skillFile, 'utf-8')
        const validation = validateSkillMd(content)
        results.push({
          name: entry.name,
          valid: validation.valid,
          errors: validation.errors.map(e => `${e.code}: ${e.message}`),
        })
      } catch (err: any) {
        results.push({ name: entry.name, valid: false, errors: [`Read error: ${err.message}`] })
      }
    }
  } catch (err: any) {
    results.push({ name: '(dir)', valid: false, errors: [`Cannot read directory: ${err.message}`] })
  }
  return results
}

export function runSkillStartupCheck(): SkillStartupCheckResult {
  const globalDir = env.OPENCODE_SKILLS_DIR || join(env.WORKSPACES_ROOT, '..', 'opencode-config', 'skills')
  const globalItems = checkSkillsDir(globalDir)

  const userItems: SkillStartupCheckResult['users'] = []
  const activeUsers = db.select().from(users).where(eq(users.status, 'active')).all()
  for (const user of activeUsers) {
    const ws = db.select().from(workspaces).where(eq(workspaces.userId, user.id)).get()
    if (!ws) continue
    const userSkillsDir = join(ws.path, '.opencode', 'skills')
    const skills = checkSkillsDir(userSkillsDir)
    if (skills.length > 0) {
      userItems.push({ userId: user.id, skills })
    }
  }

  const allItems = [...globalItems, ...userItems.flatMap(u => u.skills)]
  const ok = allItems.every(i => i.valid)

  return { global: globalItems, users: userItems, ok }
}

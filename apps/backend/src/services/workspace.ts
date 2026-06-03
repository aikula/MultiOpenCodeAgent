import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { mkdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { db } from '../db/index.js'
import { workspaces } from '../db/schema.js'
import { env } from '../env.js'

const AGENTS_MD_TEMPLATE = `# User Agent Instructions

## User

Language: Russian by default.

## Communication style

- Be practical.
- Prefer concise but complete answers.
- Ask clarification only when absolutely necessary.
- For management tasks, structure answers as decisions, risks and next actions.

## Memory

Use files in \`memory/\` when relevant:

- \`memory/profile.md\`
- \`memory/facts.md\`
- \`memory/preferences.md\`

## Tasks

When the user asks about plans, meetings, decisions or reminders:

- extract action items;
- suggest reminders;
- preserve context in the current session;
- update memory only when explicitly requested or confirmed.
`

export async function createWorkspace(userId: string) {
  const existing = db.select().from(workspaces).where(eq(workspaces.userId, userId)).get()
  if (existing) return existing

  const id = uuid()
  const dirName = `u_${uuid().replace(/-/g, '')}`
  const wsPath = join(env.WORKSPACES_ROOT, dirName)
  const now = new Date().toISOString()

  mkdirSync(wsPath, { recursive: true })
  mkdirSync(join(wsPath, 'memory'), { recursive: true })
  mkdirSync(join(wsPath, 'uploads'), { recursive: true })
  mkdirSync(join(wsPath, 'exports'), { recursive: true })
  mkdirSync(join(wsPath, '.opencode', 'skills'), { recursive: true })
  mkdirSync(join(wsPath, '.opencode', 'commands'), { recursive: true })

  writeFileSync(join(wsPath, 'AGENTS.md'), AGENTS_MD_TEMPLATE)
  writeFileSync(join(wsPath, 'opencode.json'), JSON.stringify({}, null, 2))
  writeFileSync(join(wsPath, 'memory', 'profile.md'), '')
  writeFileSync(join(wsPath, 'memory', 'facts.md'), '')
  writeFileSync(join(wsPath, 'memory', 'preferences.md'), '')

  execSync('git init', { cwd: wsPath, stdio: 'pipe' })
  execSync('git add -A', { cwd: wsPath, stdio: 'pipe' })
  execSync('git commit -m "Initial workspace"', { cwd: wsPath, stdio: 'pipe' })

  db.insert(workspaces).values({
    id,
    userId,
    path: wsPath,
    createdAt: now,
    status: 'active',
  }).run()

  return { id, userId, path: wsPath, createdAt: now, status: 'active' as const }
}

export function getWorkspace(userId: string) {
  return db.select().from(workspaces).where(eq(workspaces.userId, userId)).get()
}

export function assertInsideWorkspace(workspacePath: string, candidatePath: string) {
  const resolved = candidatePath.startsWith('/')
    ? candidatePath
    : join(workspacePath, candidatePath)

  if (!resolved.startsWith(workspacePath)) {
    throw new Error('Path escapes workspace')
  }
}

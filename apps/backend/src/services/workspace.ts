import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { join } from 'path'
import { db } from '../db/index.js'
import { workspaces } from '../db/schema.js'
import { env } from '../env.js'
import { mkdirAsync, writeFileAsync, execAsync } from '../lib/async-fs.js'

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

  await mkdirAsync(wsPath, { recursive: true })
  await mkdirAsync(join(wsPath, 'memory'), { recursive: true })
  await mkdirAsync(join(wsPath, 'uploads'), { recursive: true })
  await mkdirAsync(join(wsPath, 'exports'), { recursive: true })
  await mkdirAsync(join(wsPath, '.opencode', 'skills'), { recursive: true })
  await mkdirAsync(join(wsPath, '.opencode', 'commands'), { recursive: true })

  await writeFileAsync(join(wsPath, 'AGENTS.md'), AGENTS_MD_TEMPLATE)
  await writeFileAsync(join(wsPath, 'opencode.json'), JSON.stringify({}, null, 2))
  await writeFileAsync(join(wsPath, 'memory', 'profile.md'), '')
  await writeFileAsync(join(wsPath, 'memory', 'facts.md'), '')
  await writeFileAsync(join(wsPath, 'memory', 'preferences.md'), '')

  await execAsync('git', ['init'], wsPath)
  await execAsync('git', ['add', '-A'], wsPath)
  await execAsync('git', ['-c', 'user.name=MultiOpenCodeAgent', '-c', 'user.email=system@moca.local', 'commit', '-m', 'Initial workspace'], wsPath)

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

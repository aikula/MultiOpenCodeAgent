import type { FastifyInstance } from 'fastify'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { opencodeClient } from '../opencode/client.js'
import { getWorkspace } from '../services/workspace.js'
import { authMiddleware } from '../middleware/auth.js'
import { readFileAsync, readdirAsync } from '../lib/async-fs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsDir = join(__dirname, '..', 'skills')

async function loadCentralSkills(): Promise<Array<{ slug: string; name: string; description: string; content: string }>> {
  try {
    const dirs = (await readdirAsync(skillsDir, { withFileTypes: true })).filter(d => d.isDirectory())
    const results: Array<{ slug: string; name: string; description: string; content: string }> = []
    for (const d of dirs) {
      try {
        const content = await readFileAsync(join(skillsDir, d.name, 'SKILL.md'))
        const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)
        let name = d.name, description = ''
        if (frontmatter) {
          for (const line of frontmatter[1].split('\n')) {
            if (line.startsWith('name:')) name = line.slice(5).trim()
            if (line.startsWith('description:')) description = line.slice(12).trim()
          }
        }
        results.push({ slug: d.name, name, description, content })
      } catch { /* skip invalid */ }
    }
    return results
  } catch { return [] }
}

export async function opencodeRoutes(app: FastifyInstance) {
  app.get('/api/opencode/agents', {
    preHandler: [authMiddleware],
  }, async () => {
    try {
      const agents = await opencodeClient.listAgents()
      return {
        defaultMode: 'opencode-default',
        agents: [
          { id: 'opencode-default', title: 'OpenCode default', source: 'opencode-default', selected: true },
          ...agents.map(a => ({ ...a, source: a.source ?? 'opencode', selected: false })),
        ],
      }
    } catch {
      return {
        defaultMode: 'opencode-default',
        agents: [{ id: 'opencode-default', title: 'OpenCode default', source: 'opencode-default', selected: true }],
      }
    }
  })

  app.get('/api/opencode/skills', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    try {
      const skills = await opencodeClient.listSkills({ workspacePath: ws?.path })
      return skills
    } catch {
      return []
    }
  })

  app.get('/api/opencode/commands', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    try {
      const commands = await opencodeClient.listCommands({ workspacePath: ws?.path })
      return commands
    } catch {
      return []
    }
  })

  app.get('/api/opencode/central-skills', {
    preHandler: [authMiddleware],
  }, async () => {
    const skills = await loadCentralSkills()
    return skills.map(s => ({ slug: s.slug, name: s.name, description: s.description, source: 'central' }))
  })

  app.get('/api/opencode/central-skills/:slug', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { slug } = request.params as { slug: string }
    const skills = await loadCentralSkills()
    const skill = skills.find(s => s.slug === slug)
    if (!skill) return { error: 'Not found' }
    return skill
  })

  const DEMO_COMMANDS = [
    { name: 'daily-plan', description: 'Create a structured daily plan from your tasks and priorities' },
    { name: 'meeting-brief', description: 'Prepare a concise brief from meeting notes or transcript' },
    { name: 'find-context', description: 'Search your history for prior decisions and context' },
    { name: 'remind', description: 'Create a reminder from natural language' },
    { name: 'calendar-brief', description: 'Get a summary of your calendar for a specific date' },
    { name: 'email-draft', description: 'Draft a professional email' },
    { name: 'decision-log', description: 'Log and structure a decision with rationale' },
    { name: 'risk-review', description: 'Analyze risks for a decision or project' },
    { name: 'executive-summary', description: 'Summarize long text into executive brief' },
    { name: 'task-decompose', description: 'Break a complex task into manageable subtasks' },
  ]

  app.get('/api/opencode/commands-list', {
    preHandler: [authMiddleware],
  }, async () => {
    return DEMO_COMMANDS
  })

  app.get('/api/opencode/mcp-status', {
    preHandler: [authMiddleware],
  }, async () => {
    const result = await opencodeClient.listMcpStatus()
    return result
  })
}

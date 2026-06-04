import { eq, and, gte, lte, asc } from 'drizzle-orm'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { db } from '../db/index.js'
import {
  calendarEvents,
  reminders,
  memoryItems,
} from '../db/schema.js'
import { getWorkspace } from './workspace.js'
import { env } from '../env.js'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
  '.log', '.tsv', '.ini', '.conf', '.cfg', '.html', '.htm',
  '.js', '.ts', '.tsx', '.jsx', '.py', '.sh', '.rb', '.go',
  '.rs', '.java', '.kt', '.sql', '.css', '.scss',
])

const MAX_INLINE_FILE_SIZE = 8 * 1024
const MAX_INLINE_FILES = 5

function isTextLike(filename: string): boolean {
  return TEXT_EXTENSIONS.has(extname(filename).toLowerCase())
}

function getTodayRange(timezone: string): { start: string; end: string } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const date = fmt.format(new Date())
    return { start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` }
  } catch {
    const date = new Date().toISOString().split('T')[0]
    return { start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` }
  }
}

export interface MessageContext {
  files: Array<{ name: string; size: number; isText: boolean; content?: string }>
  calendarToday: Array<{ title: string; startsAt: string | null; location: string | null }>
  reminders: Array<{ title: string; remindAt: string }>
  memoryCount: number
  prompt: string
}

export function buildMessageContext(userId: string): MessageContext {
  const ws = getWorkspace(userId)
  const files: MessageContext['files'] = []
  const now = new Date().toISOString()

  if (ws && existsSync(ws.path)) {
    const filesDir = join(ws.path, 'files')
    if (existsSync(filesDir)) {
      try {
        const entries = readdirSync(filesDir)
          .filter(n => !n.startsWith('.'))
          .map(n => {
            const full = join(filesDir, n)
            try {
              const st = statSync(full)
              return { name: n, full, size: st.size, isFile: st.isFile() }
            } catch {
              return null
            }
          })
          .filter((e): e is { name: string; full: string; size: number; isFile: boolean } => e !== null && e.isFile)
          .sort((a, b) => b.size - a.size)
          .slice(0, 20)

        for (const e of entries) {
          const isText = isTextLike(e.name) && e.size <= MAX_INLINE_FILE_SIZE
          const item: MessageContext['files'][number] = {
            name: e.name,
            size: e.size,
            isText,
          }
          if (isText && files.filter(f => f.content).length < MAX_INLINE_FILES) {
            try {
              item.content = readFileSync(e.full, 'utf-8')
            } catch {
              /* skip */
            }
          }
          files.push(item)
        }
      } catch {
        /* ignore */
      }
    }
  }

  const { start, end } = getTodayRange(env.DEFAULT_TIMEZONE)
  const events = ws
    ? db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startsAt, start),
            lte(calendarEvents.startsAt, end),
          ),
        )
        .orderBy(asc(calendarEvents.startsAt))
        .all()
    : []

  const pendingReminders = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.status, 'scheduled'), gte(reminders.remindAt, now)))
    .orderBy(asc(reminders.remindAt))
    .all()
    .slice(0, 5)

  const memoryCount = db
    .select({ id: memoryItems.id })
    .from(memoryItems)
    .where(eq(memoryItems.userId, userId))
    .all().length

  let prompt = '\n\n[System context for this turn]\n'

  if (files.length > 0) {
    prompt += `\nFiles in your workspace (${files.length}):\n`
    for (const f of files) {
      const sizeKb = (f.size / 1024).toFixed(1)
      prompt += `- ${f.name} (${sizeKb} KB${f.isText ? ', text' : ''})`
      if (f.content) {
        const preview = f.content.length > 1500 ? f.content.slice(0, 1500) + '\n…[truncated]' : f.content
        prompt += `\n  Content:\n  ${preview.replace(/\n/g, '\n  ')}\n`
      } else if (!f.isText) {
        prompt += ' [binary, use list/read tools if available]\n'
      } else {
        prompt += '\n'
      }
    }
  } else {
    prompt += '\nNo files in workspace.\n'
  }

  if (events.length > 0) {
    prompt += `\nToday's calendar (${events.length}):\n`
    for (const e of events) {
      const t = (e.startsAt ?? '').split('T')[1]?.slice(0, 5) ?? '—'
      prompt += `- ${t} ${e.title}${e.location ? ` @ ${e.location}` : ''}\n`
    }
  } else {
    prompt += `\nNo calendar events today.\n`
  }

  if (pendingReminders.length > 0) {
    prompt += `\nPending reminders (${pendingReminders.length}):\n`
    for (const r of pendingReminders) {
      const t = (r.remindAt ?? '').replace('T', ' ').slice(0, 16)
      prompt += `- ${t} — ${r.title}\n`
    }
  } else {
    prompt += `\nNo pending reminders.\n`
  }

  prompt += `\nMemory items: ${memoryCount}.\n`

  prompt += `\nAvailable actions (these are the user's direct commands; suggest the right one):\n`
  prompt += `- "Schedule an event" → user can run \`/calendar\` to view, or send you structured text. Remind them to use the Web UI Calendar page or Telegram /calendar to add events.\n`
  prompt += `- "Create a reminder" → suggest Telegram \`/remind <when> <text>\` or Web UI Reminders page.\n`
  prompt += `- "Find prior context" → suggest Telegram \`/find <query>\` or Web UI Search page.\n`
  prompt += `- For a binary file (PDF, image), tell the user to download it from the Files page; you can describe what you see in the filename and metadata but cannot parse binary content directly here.\n`
  prompt += `[/System context]\n`

  return {
    files,
    calendarToday: events.map(e => ({ title: e.title, startsAt: e.startsAt, location: e.location })),
    reminders: pendingReminders.map(r => ({ title: r.title, remindAt: r.remindAt })),
    memoryCount,
    prompt,
  }
}

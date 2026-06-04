import { eq, and, gte, lte, like, desc, asc, sql as drizzleSql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db, sqlite } from '../db/index.js'
import {
  calendarEvents,
  memoryItems,
  messages,
  reminders,
} from '../db/schema.js'
import { env } from '../env.js'

export interface DailyPlanContext {
  date: string
  timezone: string
  events: Array<{
    id: string
    title: string
    startsAt: string | null
    endsAt: string | null
    location: string | null
  }>
  pendingReminders: Array<{
    id: string
    title: string
    remindAt: string
  }>
  recentMemory: Array<{
    type: string
    content: string
  }>
  recentMessages: Array<{
    role: string
    content: string
    createdAt: string
  }>
  conflictPairs: Array<{ a: string; b: string }>
  prompt: string
}

export function getTodayDate(timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return fmt.format(new Date())
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

export function buildDailyPlanContext(userId: string): DailyPlanContext {
  const date = getTodayDate(env.DEFAULT_TIMEZONE)

  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd = `${date}T23:59:59.999Z`

  const events = db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        gte(calendarEvents.startsAt, dayStart),
        lte(calendarEvents.startsAt, dayEnd),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .all()

  const now = new Date().toISOString()
  const pendingReminders = db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.status, 'scheduled'),
        gte(reminders.remindAt, now),
      ),
    )
    .orderBy(asc(reminders.remindAt))
    .all()
    .slice(0, 5)

  const mems = db
    .select()
    .from(memoryItems)
    .where(eq(memoryItems.userId, userId))
    .orderBy(desc(memoryItems.createdAt))
    .all()
    .slice(0, 10)

  const recentMsgs = db
    .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt))
    .all()
    .slice(0, 10)

  const conflictPairs: Array<{ a: string; b: string }> = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      if (a.startsAt && b.startsAt && a.endsAt && b.endsAt) {
        if (a.startsAt < b.endsAt && b.startsAt < a.endsAt) {
          conflictPairs.push({ a: a.title, b: b.title })
        }
      }
    }
  }

  let prompt = `# Daily plan context for ${date} (${env.DEFAULT_TIMEZONE})\n\n`

  if (events.length === 0) {
    prompt += '## Calendar\nNo events scheduled today.\n\n'
  } else {
    prompt += `## Calendar (${events.length} event${events.length === 1 ? '' : 's'})\n`
    for (const e of events) {
      const time = (e.startsAt ?? '').split('T')[1]?.slice(0, 5) ?? '—'
      const end = (e.endsAt ?? '').split('T')[1]?.slice(0, 5) ?? ''
      prompt += `- ${time}${end ? `–${end}` : ''} ${e.title}${e.location ? ` @ ${e.location}` : ''}\n`
    }
    if (conflictPairs.length > 0) {
      prompt += `\nConflicts detected: ${conflictPairs.map(c => `${c.a} ↔ ${c.b}`).join('; ')}\n`
    }
    prompt += '\n'
  }

  if (pendingReminders.length === 0) {
    prompt += '## Reminders\nNo pending reminders.\n\n'
  } else {
    prompt += `## Reminders (${pendingReminders.length})\n`
    for (const r of pendingReminders) {
      const t = r.remindAt.split('T')[1]?.slice(0, 5) ?? ''
      prompt += `- ${t} ${r.title}\n`
    }
    prompt += '\n'
  }

  if (mems.length > 0) {
    prompt += `## Memory (last ${mems.length})\n`
    for (const m of mems) {
      prompt += `- [${m.type}] ${m.content}\n`
    }
    prompt += '\n'
  }

  if (recentMsgs.length > 0) {
    prompt += `## Recent messages (last ${recentMsgs.length})\n`
    for (const m of recentMsgs.reverse()) {
      const snippet = (m.content ?? '').slice(0, 80).replace(/\n/g, ' ')
      prompt += `- ${m.role}: ${snippet}${m.content && m.content.length > 80 ? '…' : ''}\n`
    }
    prompt += '\n'
  }

  prompt +=
    'Use the daily-plan skill. Produce: top 3 priorities, time-blocked schedule with explicit 60-minute deep-work block, buffer slots, carry-over items, and trade-offs if capacity is exceeded.'

  return {
    date,
    timezone: env.DEFAULT_TIMEZONE,
    events: events.map(e => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
    })),
    pendingReminders: pendingReminders.map(r => ({
      id: r.id,
      title: r.title,
      remindAt: r.remindAt,
    })),
    recentMemory: mems.map(m => ({ type: m.type ?? 'fact', content: m.content })),
    recentMessages: recentMsgs.map(m => ({ role: m.role ?? 'user', content: m.content ?? '', createdAt: m.createdAt })),
    conflictPairs,
    prompt,
  }
}

export interface FindContextResult {
  query: string
  messages: Array<{ id: string; content: string; createdAt: string; sessionId: string }>
  memory: Array<{ id: string; type: string; content: string; createdAt: string }>
  prompt: string
}

export function buildFindContext(userId: string, query: string): FindContextResult {
  const trimmed = query.trim()
  const foundMessages: Array<{ id: string; content: string; createdAt: string; sessionId: string }> = []
  const foundMemory: Array<{ id: string; type: string; content: string; createdAt: string }> = []

  if (trimmed.length > 0) {
    try {
      const ftsQuery = trimmed.replace(/"/g, '""')
      const rows = sqlite
        .prepare(
          `SELECT m.id, m.content, m.created_at, m.session_id
           FROM messages_fts f
           JOIN messages m ON m.rowid = f.rowid
           WHERE messages_fts MATCH ? AND f.user_id = ?
           ORDER BY rank
           LIMIT 20`,
        )
        .all(`"${ftsQuery}"`, userId) as Array<{ id: string; content: string | null; created_at: string; session_id: string }>
      for (const r of rows) {
        foundMessages.push({ id: r.id, content: r.content ?? '', createdAt: r.created_at, sessionId: r.session_id })
      }
    } catch {
      const msgs = db
        .select({ id: messages.id, content: messages.content, createdAt: messages.createdAt, sessionId: messages.sessionId })
        .from(messages)
        .where(eq(messages.userId, userId))
        .all()
      for (const m of msgs) {
        if ((m.content ?? '').toLowerCase().includes(trimmed.toLowerCase())) {
          foundMessages.push({ id: m.id, content: m.content ?? '', createdAt: m.createdAt, sessionId: m.sessionId })
        }
      }
    }

    const mems = db
      .select()
      .from(memoryItems)
      .where(eq(memoryItems.userId, userId))
      .all()
      .filter(m => m.content.toLowerCase().includes(trimmed.toLowerCase()))
    for (const m of mems) {
      foundMemory.push({ id: m.id, type: m.type ?? 'fact', content: m.content, createdAt: m.createdAt })
    }
  }

  let prompt = `# Find context for query: "${trimmed}"\n\n`
  prompt += `Found ${foundMessages.length} message match${foundMessages.length === 1 ? '' : 'es'} and ${foundMemory.length} memory item${foundMemory.length === 1 ? '' : 's'}.\n\n`

  if (foundMessages.length > 0) {
    prompt += `## Messages\n`
    for (const m of foundMessages.slice(0, 5)) {
      const snippet = m.content.slice(0, 200).replace(/\n/g, ' ')
      prompt += `- [${m.createdAt}] ${snippet}${m.content.length > 200 ? '…' : ''}\n`
    }
    prompt += '\n'
  }

  if (foundMemory.length > 0) {
    prompt += `## Memory\n`
    for (const m of foundMemory) {
      prompt += `- [${m.type}] ${m.content}\n`
    }
    prompt += '\n'
  }

  prompt +=
    'Use the find-context skill. Summarise relevant prior decisions, commitments, and unresolved items. Quote the source message date and session if quoting. If no matches, say so explicitly.'

  return { query: trimmed, messages: foundMessages, memory: foundMemory, prompt }
}

export interface MeetingBriefResult {
  decisions: string[]
  actionItems: Array<{ task: string; owner: string | null; deadline: string | null }>
  risks: string[]
  followUps: string[]
  prompt: string
}

const DECISION_PATTERNS = [
  /(?:^|\.\s+)(?:decided|agreed|concluded|resolved|approved)\s+that\s+([^\.]+)/gi,
  /(?:^|\.\s+)(?:decision|verdict):\s*([^\.]+)/gi,
  /(?:решили|договорились|утвердили|приняли|согласовали),?\s+что\s+([^\.]+)/gi,
  /(?:решение|вердикт):\s*([^\.]+)/gi,
]

const ACTION_PATTERNS = [
  /(\w+)\s+(?:will|should|need(?:s)? to|must|has to)\s+([^\.]+?)(?:\s+by\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d+))?/gi,
  /(\w+)\s+(?:будет|должен|нужно|надо|требуется)\s+([^\.]+?)(?:\s+до\s+(\d{4}-\d{2}-\d{2}|\d+\s+\w+))?/gi,
  /^\s*[-*]\s*\[?\s*\]?\s*([^:]+?):\s*(.+?)(?:\s+до\s+(\d{4}-\d{2}-\d{2}))?$/gim,
  /TODO:\s*([^\n]+?)(?:\s*до\s*(\d{4}-\d{2}-\d{2}))?/gi,
  /action(?:\s+item)?:\s*([^\n]+?)(?:\s*deadline[:\s]+(\d{4}-\d{2}-\d{2}))?/gi,
]

const RISK_PATTERNS = [
  /(?:risk|risks?|concern|issue|blocker|threat):\s*([^\.]+)/gi,
  /(?:риск|проблема|угроза|блокер):\s*([^\.]+)/gi,
]

const FOLLOWUP_PATTERNS = [
  /(?:follow[\s-]?up|todo|next step|to be discussed|таск|задача|обсудить):\s*([^\.]+)/gi,
  /^(?:\?|\[\s*\])\s+(.+)$/gim,
]

function cleanText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/^[\s\-\*•]+/, '')
}

const DEADLINE_PATTERNS = [
  /\bby\s+(\d{4}-\d{2}-\d{2})\b/i,
  /\bдо\s+(\d{4}-\d{2}-\d{2})\b/i,
  /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d+/i,
  /\bdeadline[:\s]+(\d{4}-\d{2}-\d{2})\b/i,
]

function extractDeadline(sentence: string): string | null {
  for (const pat of DEADLINE_PATTERNS) {
    const m = sentence.match(pat)
    if (m) return m[1]
  }
  return null
}

export function buildMeetingBrief(notes: string): MeetingBriefResult {
  const text = notes ?? ''
  const decisions: string[] = []
  const actionItems: MeetingBriefResult['actionItems'] = []
  const risks: string[] = []
  const followUps: string[] = []

  for (const pat of DECISION_PATTERNS) {
    pat.lastIndex = 0
    let m
    while ((m = pat.exec(text)) !== null) {
      const c = cleanText(m[1])
      if (c.length > 4 && c.length < 300) decisions.push(c)
    }
  }

  const sentences = text.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(s => s.length > 0)

  for (const sentence of sentences) {
    for (const pat of ACTION_PATTERNS) {
      pat.lastIndex = 0
      let m
      while ((m = pat.exec(sentence)) !== null) {
        if (pat.source.startsWith('TODO') || pat.source.startsWith('action')) {
          actionItems.push({
            task: cleanText(m[1]),
            owner: null,
            deadline: m[2] ?? null,
          })
        } else if (m[1] && m[2]) {
          const deadline = extractDeadline(sentence)
          actionItems.push({
            task: cleanText(`${m[1]} ${m[2]}`),
            owner: cleanText(m[1]),
            deadline,
          })
        }
      }
    }
  }

  for (const pat of RISK_PATTERNS) {
    pat.lastIndex = 0
    let m
    while ((m = pat.exec(text)) !== null) {
      const c = cleanText(m[1])
      if (c.length > 4 && c.length < 300) risks.push(c)
    }
  }

  for (const pat of FOLLOWUP_PATTERNS) {
    pat.lastIndex = 0
    let m
    while ((m = pat.exec(text)) !== null) {
      const c = cleanText(m[1])
      if (c.length > 4 && c.length < 300) followUps.push(c)
    }
  }

  let prompt = `# Meeting brief extraction\n\nExtract decisions, action items, risks, and follow-ups from the following notes. Pre-extraction is provided as a starting point; verify and refine.\n\n`
  if (decisions.length > 0) {
    prompt += `## Pre-extracted decisions\n${decisions.map(d => `- ${d}`).join('\n')}\n\n`
  }
  if (actionItems.length > 0) {
    prompt += `## Pre-extracted action items\n${actionItems.map(a => `- ${a.owner ?? '?'}: ${a.task}${a.deadline ? ` (${a.deadline})` : ''}`).join('\n')}\n\n`
  }
  if (risks.length > 0) {
    prompt += `## Pre-extracted risks\n${risks.map(r => `- ${r}`).join('\n')}\n\n`
  }
  if (followUps.length > 0) {
    prompt += `## Pre-extracted follow-ups\n${followUps.map(f => `- ${f}`).join('\n')}\n\n`
  }
  prompt += `## Raw notes\n\n${text}\n\n`
  prompt +=
    'Use the meeting-brief skill. Output: meeting overview (infer from notes), discussion points, decisions (with owners), action items table (task, owner, deadline), risks, open items. Flag any action items without owner or deadline. Do not invent missing information.'

  return { decisions, actionItems, risks, followUps, prompt }
}

export interface VoiceActionSummary {
  actions: Array<{ text: string; kind: 'reminder' | 'task' | 'note' }>
  prompt: string
}

const REMINDER_TRIGGERS = /(?:remind me to|напомни|не забудь|не забыть|поставь напоминание|create reminder)/i
const TASK_TRIGGERS = /(?:i need to|need to|have to|must|todo|action item|action:|task:|сделать|нужно сделать|мне нужно|необходимо)/i

export function buildVoiceActionSummary(transcript: string): VoiceActionSummary {
  const text = transcript.trim()
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 3)

  const actions: VoiceActionSummary['actions'] = []
  for (const s of sentences) {
    if (REMINDER_TRIGGERS.test(s)) {
      const cleaned = s.replace(REMINDER_TRIGGERS, '').replace(/^(me to|to)\s+/i, '').trim()
      if (cleaned.length > 2) actions.push({ text: cleaned, kind: 'reminder' })
    } else if (TASK_TRIGGERS.test(s)) {
      const cleaned = s.replace(/^[\s\-\*•]+/, '').trim()
      if (cleaned.length > 2) actions.push({ text: cleaned, kind: 'task' })
    }
  }

  let prompt = `# Voice transcript action summary\n\nTranscript:\n"${text}"\n\n`
  if (actions.length > 0) {
    prompt += `Pre-extracted action candidates (${actions.length}):\n`
    for (const a of actions) {
      prompt += `- [${a.kind}] ${a.text}\n`
    }
  } else {
    prompt += `No explicit action triggers detected.\n`
  }
  prompt +=
    '\nUse the voice-action-summary workflow. For each action, suggest the right destination: reminder, calendar event, or memory note. If the transcript contains a date or time, use it. Output: list of (action, kind, suggested_destination).'

  return { actions, prompt }
}

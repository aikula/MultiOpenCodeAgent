import { v4 as uuid } from 'uuid'
import { eq, and, gte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { reminders, calendarEvents, messages, sessions } from '../db/schema.js'
import { opencodeClient } from '../opencode/client.js'
import { getWorkspace } from './workspace.js'
import { buildMessageContext } from './message-context.js'
import { buildDailyPlanContext, buildFindContext, buildMeetingBrief, buildVoiceActionSummary } from './manager.js'
import { env } from '../env.js'

export interface ActionRouteResult {
  sideEffects: string[]
  enrichedText: string
  reminderCreated?: { id: string; title: string; remindAt: string }
  contextBuiltIn?: boolean
}

const REMINDER_INTENT = /(?:напомни|напоминание|remind(?:er)?|не забудь|поставь напоминание)/i
const CALENDAR_INTENT = /(?:встреч[а-яё]|meeting|календар|calendar|событи[ея]|event|расписание|schedule)/i
const DAILY_PLAN_INTENT = /(?:план на день|daily\s*plan|план(?:ик)?\s+на\s+сегодня|что\s+сегодня|what'?s\s+today)/i
const FIND_CONTEXT_INTENT = /(?:найди|find|поиск|search|ищи|напомни.*контекст|где.*говорили|where.*discussed)/i
const MEETING_BRIEF_INTENT = /(?:brief|саммари|итоги встречи|meeting brief|meeting summary|резюме встречи)/i
const RISK_INTENT = /(?:risk\s*(?:review|assessment|analysis)|анализ\s*риск|оцен[кч].*риск|риск[\s-]*(?:анализ|ревью|обзор)|проведи.*риск)/i
const DECISION_INTENT = /(?:decision\s*log|лог\s*решени|зафиксируй\s*решение|запиши\s*решение|сохрани\s*решение)/i
const EMAIL_INTENT = /(?:draft.*email|email.*draft|напиши.*письмо|черновик.*письма|draft.*письмо)/i

function parseReminderFromNatural(text: string): { title: string; remindAt: Date } | null {
  const tz = env.DEFAULT_TIMEZONE
  const now = new Date()

  // "завтра в 10" or "tomorrow at 10"
  let m = text.match(/(?:завтра|tomorrow)\s+(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s+(.+)/i)
  if (m) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0)
    const title = m[3].replace(/^(?:написать|напомнить|подготовить|сделать)\s+/i, '').trim()
    if (title.length > 0) return { remindAt: d, title }
  }

  // "сегодня в 18:30" or "today at 18:30"
  m = text.match(/(?:сегодня|today)\s+(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s+(.+)/i)
  if (m) {
    const d = new Date(now)
    d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0)
    if (d <= now) return null
    const title = m[3].replace(/^(?:написать|напомнить|подготовить|сделать)\s+/i, '').trim()
    if (title.length > 0) return { remindAt: d, title }
  }

  // "через 30 минут" or "in 30 minutes"
  m = text.match(/(?:через|in)\s+(\d+)\s*(?:минут|мин|m|minutes?)\s+(.+)/i)
  if (m) {
    const d = new Date(now.getTime() + parseInt(m[1]) * 60_000)
    const title = m[2].trim()
    if (title.length > 0) return { remindAt: d, title }
  }

  // "через 2 часа" or "in 2 hours"
  m = text.match(/(?:через|in)\s+(\d+)\s*(?:час(?:а|ов)?|h|hours?)\s+(.+)/i)
  if (m) {
    const d = new Date(now.getTime() + parseInt(m[1]) * 3600_000)
    const title = m[2].trim()
    if (title.length > 0) return { remindAt: d, title }
  }

  // "2026-06-04 10:00"
  m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(.+)/)
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}:00`)
    if (!isNaN(d.getTime())) return { remindAt: d, title: m[3].trim() }
  }

  return null
}

function parseCalendarFromNatural(text: string): { title: string; startsAt: string; endsAt?: string; location?: string } | null {
  // "встреча завтра в 15:00 с Иваном" / "meeting tomorrow at 15:00 with Ivan"
  let m = text.match(/(?:встреч[а-яё]|meeting|событи[ея]|event)\s+(?:завтра|tomorrow)?\s*(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s*(.*)/i)
  if (m) {
    const now = new Date()
    const isTomorrow = /(?:завтра|tomorrow)/i.test(text)
    const d = new Date(now)
    if (isTomorrow) d.setDate(d.getDate() + 1)
    d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0)
    const title = m[3].trim().replace(/^(?:с|with)\s+/i, '').trim() || 'Встреча'
    const endsAt = new Date(d.getTime() + 3600_000).toISOString()
    return { title, startsAt: d.toISOString(), endsAt, location: undefined }
  }
  return null
}

export function routeAction(userId: string, text: string): ActionRouteResult {
  const sideEffects: string[] = []
  let enrichedText = text
  let reminderCreated: ActionRouteResult['reminderCreated']
  let handled = false
  let contextBuiltIn = false

  // 1. Reminder intent
  if (REMINDER_INTENT.test(text)) {
    const parsed = parseReminderFromNatural(text)
    if (parsed) {
      const id = uuid()
      db.insert(reminders).values({
        id,
        userId,
        title: parsed.title,
        remindAt: parsed.remindAt.toISOString(),
        timezone: env.DEFAULT_TIMEZONE,
        channel: 'both',
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      }).run()
      sideEffects.push(`Reminder created: "${parsed.title}" at ${parsed.remindAt.toISOString()}`)
      reminderCreated = { id, title: parsed.title, remindAt: parsed.remindAt.toISOString() }
      enrichedText = text.replace(/(?:напомни|напоминание|remind(?:er)?|не забудь|поставь напоминание)[^.!?]*[.!?]?\s*/i, '').trim()
    }
  }

  // 2. Calendar intent
  if (!handled && CALENDAR_INTENT.test(text) && !REMINDER_INTENT.test(text)) {
    const parsed = parseCalendarFromNatural(text)
    if (parsed) {
      db.insert(calendarEvents).values({
        id: uuid(),
        userId,
        title: parsed.title,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        location: parsed.location,
        source: 'user',
        createdAt: new Date().toISOString(),
      }).run()
      sideEffects.push(`Calendar event created: "${parsed.title}" at ${parsed.startsAt}`)
      enrichedText = text.replace(/(?:встреч[а-яё]|meeting|событи[ея]|event)[^.!?]*[.!?]?\s*/i, '').trim()
    }
  }

  // 3. Daily plan intent
  if (!handled && DAILY_PLAN_INTENT.test(text)) {
    const ctx = buildDailyPlanContext(userId)
    enrichedText = ctx.prompt
    sideEffects.push('Daily plan context built')
    handled = true
    contextBuiltIn = true
  }

  // 4. Find context intent
  if (!handled && FIND_CONTEXT_INTENT.test(text)) {
    const query = text.replace(/(?:найди|find|поиск|search|ищи|где.*говорили|where.*discussed)\s*/i, '').trim()
    if (query.length > 0) {
      const ctx = buildFindContext(userId, query)
      enrichedText = ctx.prompt
      sideEffects.push(`Context search for "${query}"`)
      handled = true
      contextBuiltIn = true
    }
  }

  // 5. Meeting brief intent
  if (!handled && MEETING_BRIEF_INTENT.test(text)) {
    const notes = text.replace(/(?:brief|саммари|итоги встречи|meeting brief|meeting summary|резюме встречи)\s*/i, '').trim()
    if (notes.length > 0) {
      const result = buildMeetingBrief(notes)
      enrichedText = result.prompt
      sideEffects.push('Meeting brief built')
      handled = true
      contextBuiltIn = true
    }
  }

  // 6. Risk review, decision log, email draft — append annotations (no conflict with reminder)
  if (RISK_INTENT.test(text)) {
    enrichedText += '\n\n[Action: risk review requested. Analyze risks and provide structured assessment.]'
    sideEffects.push('Risk review requested')
  }
  if (DECISION_INTENT.test(text)) {
    enrichedText += '\n\n[Action: decision log requested. Structure the decision with rationale, alternatives, and outcome.]'
    sideEffects.push('Decision log requested')
  }
  if (EMAIL_INTENT.test(text)) {
    enrichedText += '\n\n[Action: email draft requested. Write a professional email draft based on the context.]'
    sideEffects.push('Email draft requested')
  }

  return { sideEffects, enrichedText, reminderCreated, contextBuiltIn }
}

export async function processMessageThroughRouter(
  userId: string,
  text: string,
  channel: 'web' | 'telegram',
  targetSessionId?: string,
): Promise<{ userMsgId: string; assistantMsgId: string; assistantContent: string; sideEffects: string[]; reminderCreated?: { id: string; title: string; remindAt: string } }> {
  const ws = getWorkspace(userId)
  if (!ws) throw new Error('No workspace')

  let session
  if (targetSessionId) {
    session = db.select().from(sessions)
      .where(and(eq(sessions.id, targetSessionId), eq(sessions.userId, userId), eq(sessions.status, 'active')))
      .get()
    if (!session) throw new Error('Session not found or not owned by user')
  } else {
    session = db.select().from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')))
      .all()
      .find(s => s.isMain)
    if (!session) throw new Error('No main session')
  }

  const now = new Date().toISOString()
  const userMsgId = uuid()

  // Route through action router
  const routed = routeAction(userId, text)

  // Save user message
  db.insert(messages).values({
    id: userMsgId,
    userId,
    sessionId: session.id,
    role: 'user',
    content: text,
    channel,
    createdAt: now,
  }).run()

  // Build message context only when action-router hasn't already built its own
  const finalText = routed.enrichedText.length > 0 ? routed.enrichedText : text
  let textWithCtx: string
  if (routed.contextBuiltIn) {
    textWithCtx = finalText
  } else {
    const ctx = buildMessageContext(userId)
    textWithCtx = finalText + ctx.prompt
  }

  // Send to OpenCode with manager agent
  let assistantContent = ''
  try {
    const result = await opencodeClient.sendMessage({
      workspacePath: ws.path,
      opencodeSessionId: session.opencodeSessionId,
      text: textWithCtx,
      agent: 'manager',
    })
    assistantContent = result.content
  } catch (err: any) {
    assistantContent = `Error: ${err.message}`
  }

  // Save assistant message
  const assistantMsgId = uuid()
  db.insert(messages).values({
    id: assistantMsgId,
    userId,
    sessionId: session.id,
    role: 'assistant',
    content: assistantContent,
    channel,
    createdAt: new Date().toISOString(),
  }).run()

  return {
    userMsgId,
    assistantMsgId,
    assistantContent,
    sideEffects: routed.sideEffects,
    reminderCreated: routed.reminderCreated,
  }
}

import { v4 as uuid } from 'uuid'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { messages, sessions } from '../db/schema.js'
import { opencodeClient } from '../opencode/client.js'
import { getWorkspace } from './workspace.js'
import { buildMessageContext } from './message-context.js'

export interface ActionRouteResult {
  sideEffects: string[]
  enrichedText: string
}

export function routeAction(_userId: string, text: string): ActionRouteResult {
  return { sideEffects: [], enrichedText: text }
}

export async function processMessageThroughRouter(
  userId: string,
  text: string,
  channel: 'web' | 'telegram',
  targetSessionId?: string,
): Promise<{ userMsgId: string; assistantMsgId: string; assistantContent: string; sideEffects: string[] }> {
  const ws = getWorkspace(userId)
  if (!ws) throw new Error('No workspace')

  const session = targetSessionId
    ? db.select().from(sessions)
        .where(and(eq(sessions.id, targetSessionId), eq(sessions.userId, userId), eq(sessions.status, 'active')))
        .get()
    : db.select().from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')))
        .all()
        .find(s => s.isMain)

  if (!session) throw new Error('Session not found')

  const now = new Date().toISOString()
  const userMsgId = uuid()

  db.insert(messages).values({
    id: userMsgId,
    userId,
    sessionId: session.id,
    role: 'user',
    content: text,
    channel,
    createdAt: now,
  }).run()

  const ctx = buildMessageContext(userId)
  const textWithCtx = [
    text,
    '',
    '[AGENT_ONLY_MODE]',
    'Interpret the request naturally through AGENTS.md and available OpenCode skills.',
    'Do not ask the user to use special syntax for manager workflows.',
    'If an action tool is unavailable, give the best useful output and clearly state what could not be executed.',
    ctx.prompt,
  ].join('\n')

  const result = await opencodeClient.sendMessage({
    workspacePath: ws.path,
    opencodeSessionId: session.opencodeSessionId,
    text: textWithCtx,
    agent: 'manager',
  })

  const assistantMsgId = uuid()
  db.insert(messages).values({
    id: assistantMsgId,
    userId,
    sessionId: session.id,
    role: 'assistant',
    content: result.content,
    channel,
    createdAt: new Date().toISOString(),
  }).run()

  return {
    userMsgId,
    assistantMsgId,
    assistantContent: result.content,
    sideEffects: [],
  }
}

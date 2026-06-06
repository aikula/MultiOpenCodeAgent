import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, users, workspaces } from '../db/schema.js'
import { env } from '../env.js'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const OPENCODE_URL = env.OPENCODE_BASE_URL
const AUTH_HEADER = 'Basic ' + Buffer.from(`${env.OPENCODE_SERVER_USERNAME}:${env.OPENCODE_SERVER_PASSWORD}`).toString('base64')

const LOG_DIR = '/tmp/moca-perm'
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = join(LOG_DIR, 'audit.log')

interface OpenCodeEvent {
  payload?: {
    type?: string
    properties?: {
      id?: string
      sessionID?: string
      permission?: string
      patterns?: string[]
      metadata?: { filepath?: string; command?: string; parentDir?: string }
      tool?: { messageID?: string; callID?: string }
    }
  }
}

interface PermissionContext {
  userId: string
  userEmail: string
  userRole: string
  workspacePath: string | null
}

let started = false
let backoffMs = 1000
let abortController: AbortController | null = null

function logPermissionDecision(decision: {
  ts: string
  userId: string | null
  userEmail: string | null
  sessionId: string
  permissionId: string
  permission: string
  patterns: string[]
  decision: 'once' | 'always' | 'reject'
  reason: string
}): void {
  try {
    appendFileSync(
      LOG_FILE,
      JSON.stringify(decision) + '\n',
      { encoding: 'utf-8' },
    )
  } catch {
    /* ignore */
  }
}

async function respondToPermission(
  sessionId: string,
  permissionId: string,
  response: 'once' | 'always' | 'reject',
): Promise<void> {
  try {
    const res = await fetch(`${OPENCODE_URL}/session/${sessionId}/permissions/${permissionId}`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ response }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[perm-gate] failed to respond to ${permissionId}: ${res.status} ${text}`)
    }
  } catch (err: any) {
    console.error(`[perm-gate] response error for ${permissionId}:`, err?.message ?? err)
  }
}

function resolveContext(opencodeSessionId: string): PermissionContext | null {
  // `opencodeSessionId` is the ID OpenCode sends in events (e.g. ses_xxx).
  // We look it up in our `sessions.opencodeSession_id` column to find the owner.
  const sess = db
    .select()
    .from(sessions)
    .where(eq(sessions.opencodeSessionId, opencodeSessionId))
    .get()
  if (!sess) return null

  const user = db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, sess.userId))
    .get()
  if (!user) return null

  const ws = db
    .select({ path: workspaces.path })
    .from(workspaces)
    .where(eq(workspaces.userId, user.id))
    .get()

  return {
    userId: user.id,
    userEmail: user.email ?? '',
    userRole: user.role ?? 'user',
    workspacePath: ws?.path ?? null,
  }
}

function isWithinWorkspace(workspacePath: string, target: string): boolean {
  if (!target) return false
  const norm = (s: string) => s.replace(/\/+$/, '')
  const ws = norm(workspacePath)
  const tgt = norm(target)
  if (tgt === ws || tgt.startsWith(ws + '/')) return true

  // Cross-container paths: the host path (e.g. /app/data/workspaces/u_xxx)
  // and the OpenCode mount (/workspaces/u_xxx) refer to the same workspace.
  // Match by extracting the `u_<uuid>` segment.
  const extractUuid = (p: string): string | null => {
    const m = p.match(/\/(u_[a-f0-9]+)\/?$/i) || p.match(/\/(u_[a-f0-9]+)\//i)
    return m ? m[1].toLowerCase() : null
  }
  const wsUuid = extractUuid(ws)
  const tgtUuid = extractUuid(tgt)
  return wsUuid !== null && tgtUuid !== null && wsUuid === tgtUuid
}

function decidePermission(
  ctx: PermissionContext,
  permission: string,
  patterns: string[],
  metadata: { filepath?: string; command?: string; parentDir?: string },
): { response: 'once' | 'always' | 'reject'; reason: string } {
  if (!ctx.workspacePath) {
    return { response: 'reject', reason: 'no workspace for user' }
  }

  if (permission === 'external_directory') {
    const filepath = metadata.filepath
    if (filepath && isWithinWorkspace(ctx.workspacePath, filepath)) {
      return { response: 'once', reason: `path within user workspace: ${filepath}` }
    }
    if (filepath) {
      return { response: 'reject', reason: `path outside user workspace: ${filepath}` }
    }
    const parentDir = metadata.parentDir
    if (parentDir && isWithinWorkspace(ctx.workspacePath, parentDir)) {
      return { response: 'once', reason: `parent dir within workspace: ${parentDir}` }
    }
    return { response: 'reject', reason: 'no filepath in permission request' }
  }

  if (permission === 'bash') {
    const command = metadata.command ?? ''
    const userWs = ctx.workspacePath

    // Extract all absolute paths from the command
    const pathMatches = command.match(/(?:\/[\w.\-]+)+/g) ?? []
    const userWsUuid = userWs.match(/\/(u_[a-f0-9]+)/i)?.[1]?.toLowerCase()

    // Check every absolute path in the command
    for (const p of pathMatches) {
      if (p === '/bin' || p === '/usr' || p.startsWith('/usr/') || p.startsWith('/bin/') || p.startsWith('/tmp/')) continue
      if (isWithinWorkspace(userWs, p)) continue
      // Path is outside workspace — reject unless it's an innocuous system path
      return { response: 'reject', reason: `bash command references path outside workspace: ${p}` }
    }

    // No absolute paths referencing outside dirs. Allow read-only commands.
    if (
      /^(ls|cat|head|tail|stat|file|wc|grep|echo|pwd|whoami|date)(\s|$)/.test(command) &&
      !command.includes(' / ')
    ) {
      return { response: 'once', reason: 'safe read-only command' }
    }

    // Commands explicitly referencing user workspace
    if (command.includes(userWs) || (userWsUuid && command.includes(userWsUuid))) {
      return { response: 'once', reason: 'bash command references user workspace path' }
    }

    return { response: 'reject', reason: `bash command not in user workspace: ${command.slice(0, 80)}` }
  }

  if (
    permission === 'read' ||
    permission === 'edit' ||
    permission === 'write' ||
    permission === 'glob' ||
    permission === 'grep'
  ) {
    return { response: 'once', reason: 'read/edit within default workspace' }
  }

  if (permission === 'webfetch' || permission === 'websearch') {
    return { response: 'reject', reason: 'web access disabled' }
  }

  return { response: 'reject', reason: `unknown permission type: ${permission}` }
}

async function handleEvent(event: OpenCodeEvent): Promise<void> {
  const payload = event.payload
  if (!payload || payload.type !== 'permission.asked') return

  const props = payload.properties
  if (!props) return
  const sessionId = props.sessionID
  const permissionId = props.id
  const permission = props.permission
  const patterns = props.patterns ?? []
  const metadata = props.metadata ?? {}

  if (!sessionId || !permissionId || !permission) {
    console.warn('[perm-gate] missing fields in permission.asked event', props)
    return
  }

  const ctx = resolveContext(sessionId)
  if (!ctx) {
    console.warn(`[perm-gate] no user context for session ${sessionId}, rejecting`)
    await respondToPermission(sessionId, permissionId, 'reject')
    logPermissionDecision({
      ts: new Date().toISOString(),
      userId: null,
      userEmail: null,
      sessionId,
      permissionId,
      permission,
      patterns,
      decision: 'reject',
      reason: 'no user context',
    })
    return
  }

  const { response, reason } = decidePermission(ctx, permission, patterns, metadata)
  await respondToPermission(sessionId, permissionId, response)
  logPermissionDecision({
    ts: new Date().toISOString(),
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    sessionId,
    permissionId,
    permission,
    patterns,
    decision: response,
    reason,
  })
  console.log(`[perm-gate] ${ctx.userEmail} ${permission} ${JSON.stringify(metadata)} → ${response} (${reason})`)
}

async function readSse(): Promise<void> {
  abortController = new AbortController()
  const res = await fetch(`${OPENCODE_URL}/global/event`, {
    headers: { Authorization: AUTH_HEADER, Accept: 'text/event-stream' },
    signal: abortController.signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: ${res.status}`)
  }

  console.log('[perm-gate] SSE connected')
  backoffMs = 1000

  const reader = (res.body as any).getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIdx: number
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        const dataLines: string[] = []
        for (const line of event.split('\n')) {
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
        }
        if (dataLines.length === 0) continue
        const dataStr = dataLines.join('\n')
        try {
          const obj = JSON.parse(dataStr)
          await handleEvent(obj)
        } catch (err) {
          /* ignore parse errors */
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      throw err
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
}

async function connect(): Promise<void> {
  if (started) return
  started = true
  const url = `${OPENCODE_URL}/global/event`
  console.log(`[perm-gate] connecting to SSE ${url}`)

  while (started) {
    try {
      await readSse()
    } catch (err: any) {
      if (!started) break
      console.warn(`[perm-gate] SSE error: ${err?.message ?? err}, reconnecting in ${backoffMs}ms`)
      await new Promise(r => setTimeout(r, backoffMs))
      backoffMs = Math.min(backoffMs * 2, 30_000)
    }
  }
}

export function startPermissionGate(): void {
  if (env.ALLOW_LOCAL_OPENCODE_FALLBACK) {
    console.log('[perm-gate] skipped (local fallback enabled)')
    return
  }
  try {
    void connect()
  } catch (err) {
    console.error('[perm-gate] initial connect failed', err)
  }
}

export function stopPermissionGate(): void {
  started = false
  if (abortController) {
    try { abortController.abort() } catch { /* ignore */ }
  }
}

export const decidePermissionForTest = decidePermission
export const isWithinWorkspaceForTest = isWithinWorkspace
export const resolveContextForTest = resolveContext

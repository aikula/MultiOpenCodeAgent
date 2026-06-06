# Hotfix: strict agent-only demo mode

## Goal

Remove manager slash-command demo flows and backend regex triggers. The platform must behave as an agentic OpenCode experience:

- ordinary Web text -> OpenCode manager agent;
- ordinary Telegram text -> OpenCode manager agent;
- Telegram voice -> STT -> OpenCode manager agent;
- OpenCode manager agent + AGENTS.md + skills decide how to respond;
- no `/daily`, `/find`, `/meeting`, `/voice`, `/remind`, `/calendar` as demo mechanics;
- keep only service commands needed for account linking and help.

## Status found

Logout and profile deletion already exist:

- `apps/frontend/src/components/Layout.tsx` has Logout in sidebar.
- `apps/frontend/src/pages/Settings.tsx` has Log out button and Danger Zone with account deletion.

Make them more visible, but do not reimplement backend deletion.

## P0. Replace backend regex action router

File: `apps/backend/src/services/action-router.ts`

Replace the file with a passthrough router:

```ts
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
```

Expected effect:

- No backend-created reminders/calendar/search from regex.
- OpenCode manager + skills decide the response.
- If real tool execution is needed later, implement backend-owned MCP instead of regex routing.

## P0. Remove manager slash commands from Telegram bot

File: `apps/backend/src/telegram/bot.ts`

Keep only:

- `/start`
- `/login <code>`
- `/help`

Optional service commands for debugging only, hidden from help:

- `/sessions`
- `/new`
- `/use`
- `/main`
- `/limits`

Remove or disable these demo/manager commands:

- `/remind`
- `/calendar`
- `/daily`
- `/find`
- `/meeting`
- `/voice`
- `/files`
- `/sendfile`

Update help text to:

```ts
bot.command('help', async (ctx) => {
  await ctx.reply(
    'MultiOpenCodeAgent\n\n' +
    'Send normal text or voice. The manager agent will interpret the request using AGENTS.md and OpenCode skills.\n\n' +
    'Service commands:\n' +
    '/login <code> — link your account\n' +
    '/help — show this help'
  )
})
```

Text handler must stay and route all normal text to the manager agent.

Voice handler must stay and route transcript to the manager agent.

## P0. Add admin diagnostics endpoint

File: `apps/backend/src/routes/admin.ts`

Add an endpoint:

```ts
app.get('/api/admin/diagnostics', {
  preHandler: [adminMiddleware],
}, async () => {
  const result: Record<string, any> = {
    time: new Date().toISOString(),
    checks: {},
  }

  try {
    result.checks.openCodeHealth = await opencodeClient.health()
  } catch (err: any) {
    result.checks.openCodeHealth = { ok: false, error: err.message }
  }

  try {
    const agents = await opencodeClient.listAgents()
    result.checks.agents = {
      ok: agents.some((a: any) => a.id === 'manager' || a.name === 'manager'),
      count: agents.length,
      items: agents,
    }
  } catch (err: any) {
    result.checks.agents = { ok: false, error: err.message }
  }

  try {
    const skills = await opencodeClient.listSkills()
    result.checks.skills = {
      ok: Array.isArray(skills) && skills.length > 0,
      count: Array.isArray(skills) ? skills.length : 0,
      items: skills,
    }
  } catch (err: any) {
    result.checks.skills = { ok: false, error: err.message }
  }

  try {
    result.checks.mcp = await opencodeClient.listMcpStatus()
  } catch (err: any) {
    result.checks.mcp = { ok: false, error: err.message }
  }

  try {
    result.checks.skillStartup = runSkillStartupCheck()
  } catch (err: any) {
    result.checks.skillStartup = { ok: false, error: err.message }
  }

  result.checks.database = {
    users: db.select().from(users).all().length,
    sessions: db.select().from(sessions).all().length,
    reminders: db.select().from(reminders).all().length,
    calendarEvents: db.select().from(calendarEvents).all().length,
    memoryItems: db.select().from(memoryItems).all().length,
  }

  return result
})
```

Required imports:

```ts
import { opencodeClient } from '../opencode/client.js'
import { runSkillStartupCheck } from '../services/skill-startup-check.js'
import { sessions, reminders, calendarEvents, memoryItems } from '../db/schema.js'
```

## P0. Add frontend diagnostics

File: `apps/frontend/src/api/client.ts`

Add:

```ts
adminDiagnostics: () => request('/admin/diagnostics'),
```

File: `apps/frontend/src/pages/Admin.tsx`

Add a Diagnostics tab with a `Run diagnostics` button that calls `api.adminDiagnostics()` and renders JSON in a `<pre>` block.

## P0. Make Logout/Delete profile visible

Already exists:

- sidebar logout in `Layout.tsx`;
- Settings top logout;
- Settings danger zone delete.

Improve visibility:

1. Rename sidebar button from `Logout` to `Log out`.
2. Add a small red button in sidebar:

```tsx
<button onClick={() => navigate('/settings')} className="block text-xs text-red-600 hover:text-red-700 mt-2">
  Delete profile...
</button>
```

## P0. Update wording

Make sure both `AGENTS.md` and `apps/opencode/opencode.json` say:

- natural language only for demo workflows;
- no special syntax required;
- OpenCode manager agent must use skills;
- if execution tools are unavailable, explain and produce useful output;
- backend regex triggers are disabled.

## P0. Tests to adjust

Old tests expecting backend-created reminders from regex should be removed or rewritten.

New tests:

1. `routeAction()` returns original text and no side effects.
2. Web message calls OpenCode manager.
3. Telegram text calls OpenCode manager.
4. Telegram voice transcript calls OpenCode manager.
5. `/help` does not list manager slash workflows.
6. Admin diagnostics endpoint returns OpenCode health, agents, skills, mcp, skillStartup and database sections.

## Demo script after hotfix

Use only natural language:

1. Register with invite code.
2. Open Web chat.
3. Send: `Подготовь план дня и учти мои встречи, напоминания и прошлые решения.`
4. Send: `Напомни завтра в 10 написать Ивану по договору. Подготовь план встречи.`
5. Telegram: send normal text, not slash command.
6. Admin: run diagnostics.
7. Settings: show logout and delete profile controls.

Important: until backend-owned MCP tools for reminders/calendar are implemented, the manager agent may describe the action rather than write DB records. Do not promise real reminder/calendar persistence from natural language unless diagnostics/smoke test proves it.

# Instructions for the coding agent

You are implementing MultiOpenCodeAgent.

## Primary objective

Build a fast working MVP around OpenCode that demonstrates useful manager workflows:

- Telegram bot;
- Web chat;
- sessions;
- user-isolated workspaces;
- default OpenCode agents and skills;
- personal AGENTS.md;
- central and user skills;
- curated marketplace skill import;
- reminders;
- calendar;
- search;
- voice transcription;
- usage limits.

## Hard rules

```text
[ ] Do not expose OpenCode directly to users.
[ ] Do not create a new agent runtime.
[ ] Use OpenCode defaults first.
[ ] Do not hide OpenCode default agents.
[ ] Do not hide OpenCode default skills.
[ ] default_agent = NULL means OpenCode default.
[ ] Every user has a separate workspace.
[ ] Every workspace is a git repository.
[ ] Workspace path is never accepted from client input.
[ ] Workspace path is resolved by authenticated user_id only.
[ ] Workspace paths must be ASCII-only and UUID-based.
[ ] All user data access must be filtered by authenticated user_id.
[ ] Users cannot configure MCP in v1.
[ ] Users cannot install OpenCode plugins in v1.
[ ] Users cannot add custom tools in v1.
[ ] Marketplace skills are copied as local SKILL.md files only after scan and approval.
[ ] Never run marketplace setup scripts.
[ ] SQLite is the primary database.
[ ] Prefer working implementation over architectural decoration.
```

## Implementation order

```text
1. Repository bootstrap.
2. Backend skeleton.
3. SQLite migrations.
4. OpenCode health and client.
5. Auth and users.
6. Workspace creation.
7. Main session creation.
8. Web chat.
9. Telegram text.
10. Quotas.
11. OpenCode agents list.
12. AGENTS.md editor.
13. User skills.
14. Skill catalog import and scanner.
15. Voice STT.
16. Reminders.
17. Calendar.
18. Search.
19. Admin panel.
20. Demo pack.
21. Tests and smoke script.
```

Do not proceed to later phases if user, session and workspace isolation tests fail.

## Expected repository structure

```text
apps/
  backend/
    src/
      auth/
      db/
      opencode/
      users/
      sessions/
      telegram/
      stt/
      reminders/
      calendar/
      search/
      skills/
      marketplace/
      admin/
    package.json
  frontend/
    src/
      pages/
      components/
      api/
    package.json
packages/
  shared/
    src/
      types/
      validation/
docs/
  DEVELOPMENT_SPEC.md
  SKILLS_AGENTS_AND_MARKETPLACE.md
  IMPLEMENTATION_PLAN.md
  CODE_AGENT_INSTRUCTIONS.md
.env.example
docker-compose.yml
README.md
```

## Environment variables

Add `.env.example` with:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./data/app.db
JWT_SECRET=change-me
WORKSPACES_ROOT=./data/workspaces

OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=change-me

TELEGRAM_BOT_TOKEN=
STT_BASE_URL=
STT_API_KEY=

DEFAULT_TIMEZONE=Europe/Vilnius
DAILY_QUOTA_LIMIT=20
WELCOME_QUOTA=30
```

## OpenCode client requirements

Implement:

```ts
class OpenCodeClient {
  constructor(config: OpenCodeConfig)
  health(): Promise<HealthResult>
  listAgents(): Promise<AgentInfo[]>
  listSkills(input?: { workspacePath?: string }): Promise<SkillInfo[]>
  listCommands(input?: { workspacePath?: string }): Promise<CommandInfo[]>
  createSession(input: { workspacePath: string; title?: string }): Promise<OpenCodeSession>
  sendMessage(input: {
    workspacePath: string
    opencodeSessionId: string
    text: string
    agent?: string | null
    model?: string | null
  }): Promise<OpenCodeMessageResult>
}
```

Rules:

```text
[ ] Include server authentication on every OpenCode request.
[ ] Do not log server credentials.
[ ] If agent is null, omit agent override.
[ ] If model is null, omit model override.
[ ] Fail with clear errors when OpenCode is unavailable.
```

## Workspace service requirements

Implement:

```ts
class WorkspaceService {
  createForUser(userId: string): Promise<Workspace>
  getForUser(userId: string): Promise<Workspace>
  assertInsideWorkspace(workspacePath: string, candidatePath: string): void
}
```

Rules:

```text
[ ] Workspace directory name: u_<uuid>.
[ ] Create .git directory via git init.
[ ] Create AGENTS.md from template.
[ ] Create memory files.
[ ] Create .opencode/skills and .opencode/commands.
```

## Default AGENTS.md template

Use this:

```markdown
# User Agent Instructions

## User

Language: Russian by default.

## Communication style

- Be practical.
- Prefer concise but complete answers.
- Ask clarification only when absolutely necessary.
- For management tasks, structure answers as decisions, risks and next actions.

## Memory

Use files in `memory/` when relevant:

- `memory/profile.md`
- `memory/facts.md`
- `memory/preferences.md`

## Tasks

When the user asks about plans, meetings, decisions or reminders:

- extract action items;
- suggest reminders;
- preserve context in the current session;
- update memory only when explicitly requested or confirmed.
```

## Manager demo commands

Implement as central commands or central skills:

```text
/daily-plan
/meeting-brief
/find-context
/remind
/calendar-brief
/email-draft
/decision-log
/risk-review
```

Each command must return structured management output, not generic chat sludge.

## Marketplace skill scanner

Implement `scanSkillPackage`:

```ts
type SkillScanStatus = 'approved' | 'needs_review' | 'rejected'

interface SkillScanResult {
  status: SkillScanStatus
  score: number
  findings: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    code: string
    message: string
  }>
}
```

Reject or flag:

```text
[ ] files outside expected skill directory;
[ ] binary files;
[ ] setup scripts;
[ ] MCP config;
[ ] plugin config;
[ ] references to private configuration files;
[ ] credential-like content;
[ ] instructions to disable permissions;
[ ] direct writes to global OpenCode config;
[ ] hidden files except allowed metadata.
```

## Tests to implement first

```text
[ ] default_agent NULL omits explicit agent override.
[ ] User A cannot access User B session.
[ ] User A cannot search User B messages.
[ ] User A cannot read User B AGENTS.md.
[ ] Workspace escape attempts are rejected.
[ ] User skill escape attempts are rejected.
[ ] Marketplace skill with setup script is rejected.
[ ] Marketplace skill with MCP config is rejected.
[ ] Zero quota blocks Web message.
[ ] Zero quota blocks Telegram message.
```

## Final smoke test

Create a script or documented manual flow:

```text
1. Start OpenCode.
2. Start backend.
3. Start frontend.
4. Register user.
5. Send Web message.
6. Create another session.
7. Link Telegram.
8. Send Telegram message.
9. Send Telegram voice with mocked STT.
10. Create reminder.
11. Trigger reminder.
12. Create calendar event.
13. Ask calendar brief.
14. Create user skill.
15. Import and install approved marketplace skill.
16. Search prior message.
17. Block user.
18. Verify blocked user cannot use Web or Telegram.
```

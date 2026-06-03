# Development specification for MultiOpenCodeAgent

## 1. Product objective

Build a fast MVP that demonstrates why a manager needs agents, not just another chat UI.

The platform must support:

- multi-user access;
- isolated user workspaces and sessions;
- one shared internal OpenCode server to save resources;
- Telegram bot access;
- Web UI for chat, settings, sessions, limits and personal configuration;
- personal `AGENTS.md` per user;
- OpenCode default agents and skills by default;
- central skills, user skills and curated skill catalog import;
- centralized MCP only;
- reminders;
- calendar management;
- search across user history and memory;
- voice messages through an external STT server;
- daily and welcome usage limits.

The MVP must be useful for management workflows from the first demo. Architecture purity is welcome only after the system actually works, humanity's least favorite constraint.

## 2. Architecture

```text
Telegram Bot / Web UI
        |
        v
Platform API / Gateway
  - auth
  - users
  - quotas
  - sessions
  - Telegram routing
  - STT adapter
  - reminders
  - calendar/search tools
  - SQLite
        |
        v
OpenCode Server
  - localhost only
  - Basic Auth
  - default agents
  - default skills
  - central MCP
        |
        v
User Workspaces
  /data/workspaces/u_<uuid>/
```

The platform is a control plane around OpenCode. It must not reimplement the OpenCode agent runtime.

## 3. Technology stack

Recommended stack:

```text
Backend: Node.js 20+, TypeScript, Fastify or Hono
Database: SQLite with WAL
ORM/query builder: Drizzle ORM or Kysely
Telegram: Telegraf
Validation: Zod
Auth: JWT plus bcrypt/argon2
Frontend: Vite, React, TypeScript
Styling: Tailwind or simple CSS
```

Use simple deployment first. Docker Compose is enough for v1.

## 4. OpenCode server

Run OpenCode as an internal service only:

```bash
OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=<strong-password> \
opencode serve --hostname 127.0.0.1 --port 4096
```

Rules:

```text
[ ] OpenCode must listen on localhost only.
[ ] OpenCode must require Basic Auth.
[ ] Users must never access OpenCode directly.
[ ] Platform API is the only component that calls OpenCode.
[ ] OpenCode server URL and credentials are configured through env.
```

## 5. Data model

### 5.1. users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT CHECK(role IN ('user', 'admin')) DEFAULT 'user',
  status TEXT CHECK(status IN ('active', 'blocked', 'pending')) DEFAULT 'active',
  default_agent TEXT DEFAULT NULL,
  default_model TEXT DEFAULT NULL,
  language TEXT DEFAULT 'ru',
  response_style TEXT DEFAULT 'concise',
  daily_quota_limit INTEGER DEFAULT 20,
  welcome_quota_granted INTEGER DEFAULT 30,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Important: `default_agent = NULL` means use OpenCode default agent. Do not force a platform-specific agent unless the user or admin selected one.

### 5.2. telegram_links

```sql
CREATE TABLE telegram_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  telegram_user_id TEXT UNIQUE NOT NULL,
  telegram_username TEXT,
  linked_at TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);
```

### 5.3. workspaces

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  status TEXT DEFAULT 'active'
);
```

Physical layout:

```text
/data/workspaces/u_<uuid>/
  .git/
  AGENTS.md
  opencode.json
  memory/
    profile.md
    facts.md
    preferences.md
  uploads/
  exports/
  .opencode/
    skills/
    commands/
```

Every workspace must be initialized as a git repository.

### 5.4. sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  opencode_session_id TEXT NOT NULL,
  title TEXT,
  is_main INTEGER DEFAULT 0,
  source TEXT CHECK(source IN ('web', 'telegram', 'system')) DEFAULT 'web',
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Each user must have exactly one main session.

### 5.5. messages

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  channel TEXT CHECK(channel IN ('web', 'telegram', 'system')),
  opencode_message_id TEXT,
  created_at TEXT NOT NULL
);
```

Add FTS:

```sql
CREATE VIRTUAL TABLE messages_fts
USING fts5(content, user_id, session_id, content='messages', content_rowid='rowid');
```

### 5.6. memory_items

```sql
CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT CHECK(type IN ('fact', 'preference', 'task_context', 'decision')),
  content TEXT NOT NULL,
  source_session_id TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 5.7. quota_ledger

```sql
CREATE TABLE quota_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
```

Balance is the sum of all ledger deltas.

### 5.8. reminders

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  remind_at TEXT NOT NULL,
  timezone TEXT DEFAULT 'Europe/Vilnius',
  channel TEXT CHECK(channel IN ('telegram', 'web', 'both')) DEFAULT 'telegram',
  status TEXT CHECK(status IN ('scheduled', 'sent', 'cancelled')) DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);
```

### 5.9. calendar_events

```sql
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  external_id TEXT,
  title TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  location TEXT,
  description TEXT,
  source TEXT DEFAULT 'local',
  created_at TEXT NOT NULL
);
```

## 6. User roles

### user

Can:

- chat in Web UI;
- use Telegram bot;
- create and manage own sessions;
- edit own `AGENTS.md`;
- create own skills;
- create own commands;
- search own history;
- manage own reminders;
- manage local calendar events;
- see own limits and settings.

Cannot:

- see another user's data;
- configure MCP;
- install plugins;
- add custom tools;
- access OpenCode directly;
- set raw workspace path.

### admin

Can:

- create users;
- block users;
- manually link Telegram IDs;
- edit user limits;
- grant quota;
- manage central skills;
- view audit log;
- view technical system status.

## 7. API endpoints

### Auth

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

### Settings

```http
GET /api/me/settings
PUT /api/me/settings
GET /api/me/agents-md
PUT /api/me/agents-md
```

### Sessions

```http
GET    /api/sessions
POST   /api/sessions
GET    /api/sessions/:id/messages
POST   /api/sessions/:id/messages
POST   /api/sessions/:id/main
POST   /api/sessions/:id/fork
DELETE /api/sessions/:id
GET    /api/sessions/:id/stream
```

### Skills

```http
GET    /api/skills
POST   /api/skills
GET    /api/skills/:id
PUT    /api/skills/:id
DELETE /api/skills/:id
```

### Marketplace skills

```http
GET  /api/skill-catalogs
POST /api/skill-catalogs/import
POST /api/skill-catalogs/scan
POST /api/skill-catalogs/:catalogId/skills/:skillId/install
```

### Reminders

```http
GET    /api/reminders
POST   /api/reminders
PATCH  /api/reminders/:id
DELETE /api/reminders/:id
```

### Calendar

```http
GET    /api/calendar/events
POST   /api/calendar/events
PATCH  /api/calendar/events/:id
DELETE /api/calendar/events/:id
POST   /api/calendar/brief
```

### Search

```http
GET /api/search?q=&scope=
```

### Admin

```http
GET   /api/admin/users
POST  /api/admin/users
PATCH /api/admin/users/:id
POST  /api/admin/users/:id/quota
POST  /api/admin/users/:id/telegram-link
GET   /api/admin/audit
```

## 8. OpenCode integration

Implement `OpenCodeClient` with these methods:

```ts
interface OpenCodeClient {
  health(): Promise<HealthResult>
  listAgents(): Promise<AgentInfo[]>
  listSkills(workspacePath?: string): Promise<SkillInfo[]>
  listCommands(workspacePath?: string): Promise<CommandInfo[]>
  createSession(input: { workspacePath: string; title?: string }): Promise<OpenCodeSession>
  getSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<OpenCodeSession>
  sendMessage(input: {
    workspacePath: string
    opencodeSessionId: string
    agent?: string | null
    model?: string | null
    text: string
  }): Promise<OpenCodeMessageResult>
  forkSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<OpenCodeSession>
  summarizeSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<string>
}
```

Hard rule:

```text
No OpenCode session or message call may be made without workspacePath.
workspacePath must be resolved from authenticated user_id.
workspacePath must never come from client input.
```

## 9. Telegram bot

Private DM only in v1.

Commands:

```text
/start
/help
/login <code>
/sessions
/new <title>
/use <session_number>
/main
/limits
/remind <text>
/calendar
/settings
```

Text flow:

```text
1. Receive Telegram message.
2. Resolve telegram_user_id to user_id.
3. Check user status.
4. Check quota.
5. Resolve main session.
6. Send text to OpenCode session.
7. Send answer back to Telegram.
8. Mirror message to SQLite.
```

Voice flow:

```text
1. Receive voice message.
2. Download file.
3. Save to workspace/uploads/.
4. Send file to STT provider.
5. Save transcript.
6. Send transcript to main OpenCode session.
7. Return answer to Telegram.
```

## 10. Manager demo workflows

Implement these central commands and skills:

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

Demo scenario:

```text
1. User sends voice in Telegram:
   "Remind me tomorrow at 10 to write Ivan about the contract and prepare a meeting plan."
2. System transcribes voice.
3. Agent creates reminder.
4. Agent prepares meeting plan.
5. User opens Web UI and sees the same session.
6. User asks: "What did we decide about Ivan's contract?"
7. Agent searches history and summarizes context.
8. User adds a calendar event from chat.
```

## 11. Security checks

Mandatory tests:

```text
[ ] User A cannot list User B sessions.
[ ] User A cannot open User B session by direct ID.
[ ] User A cannot search User B messages.
[ ] User A cannot read User B AGENTS.md.
[ ] User A cannot access User B uploads.
[ ] Telegram user ID cannot spoof another account.
[ ] Blocked user cannot use Web.
[ ] Blocked user cannot use Telegram.
[ ] OpenCode is not exposed externally.
[ ] OpenCode requires Basic Auth.
[ ] Workspace path is resolved via DB only.
[ ] Path traversal attempts are rejected.
```

## 12. Definition of Done for v1

```text
[ ] Web UI exists.
[ ] Registration and login work.
[ ] Telegram bot works.
[ ] User isolation is implemented.
[ ] Separate workspaces exist.
[ ] Each workspace is a git repo.
[ ] Main session exists for every user.
[ ] Multiple sessions work.
[ ] AGENTS.md editor works.
[ ] OpenCode default agents are visible and usable.
[ ] OpenCode default skills are visible and usable.
[ ] User skills work.
[ ] Curated marketplace skill import works.
[ ] Quotas work.
[ ] Telegram voice through STT works.
[ ] Reminders work.
[ ] Local calendar works.
[ ] Search across history works.
[ ] Demo commands work.
[ ] Admin panel exists.
[ ] Audit log exists.
[ ] Smoke test script exists.
```

# Development Log

## Session: 2026-06-03

### Step 0: Repository bootstrap

Status: **completed**

#### Decisions

- **Monorepo structure**: `apps/backend`, `apps/frontend`, `packages/shared` — matches spec requirements.
- **Backend**: Fastify + TypeScript + Drizzle ORM (SQLite). Fastify chosen for speed and plugin ecosystem. Drizzle for type-safe SQL with SQLite.
- **Frontend**: Vite + React + TypeScript + Tailwind CSS.
- **Build tool**: npm workspaces for monorepo management.
- **Package manager**: npm (available by default, no extra install needed).

#### Errors and fixes

1. **`@types/better-sqlite3@^7.6.14` not found** — version didn't exist. Fixed by pinning to `^7.6.13`.
2. **FTS5 `CREATE TABLE` syntax error** — Drizzle's `db.run(sql`...`)` can't handle `CREATE VIRTUAL TABLE`. The first attempt had a duplicate `CREATE TABLE IF NOT EXISTS messages_fts` followed by `CREATE VIRTUAL TABLE`. Fixed by removing the regular CREATE TABLE and using raw `sqlite.exec()` for FTS5.
3. **`@moca/shared/validation` module not found** — subpath exports not configured. Fixed by adding `exports` field to shared package.json.
4. **Root package.json overwritten** — accidentally wrote frontend package.json to root. Restored root package.json with workspaces config. Fixed workspace scripts to use `@moca/package-name` instead of path-based references.

### Step 1: Backend skeleton + SQLite migrations

Status: **completed**

- All 12 database tables created (users, telegram_links, workspaces, sessions, messages, memory_items, quota_ledger, reminders, calendar_events, skill_catalogs, marketplace_skills, user_installed_skills).
- FTS5 virtual table for messages.
- Health endpoint works.

### Step 2: OpenCode client bridge

Status: **completed**

- `OpenCodeClient` class with health, listAgents, listSkills, listCommands, createSession, sendMessage, forkSession, summarizeSession.
- Basic Auth headers on every request.
- Graceful fallback when OpenCode unavailable (local session IDs).

### Step 3: Auth, users, workspaces

Status: **completed**

- JWT auth with @fastify/jwt.
- Registration creates workspace (git init, AGENTS.md template, memory files, .opencode dirs).
- Welcome quota grant on registration.
- Workspace path resolved from authenticated userId only.
- Admin middleware for admin-only routes.

### Step 4: API routes

Status: **completed**

All API endpoints implemented:
- Auth: register, login, me
- Sessions: CRUD, messages, set main, fork
- Settings: get/put, AGENTS.md get/put
- Skills: CRUD with workspace isolation
- Reminders: CRUD
- Calendar: CRUD, brief with conflict detection
- Search: messages + memory search by user
- Admin: users list, create, block, quota grant, telegram link, audit

### Step 5: Frontend web UI

Status: **completed**

Pages built:
- Login / Register with form validation
- Chat with session sidebar, message bubbles, real-time send
- Reminders — list, create, cancel
- Calendar — list events, create, delete, daily brief
- Skills — CRUD with inline editor
- Settings — profile fields + AGENTS.md editor

Frontend builds successfully (250KB gzipped). Dev server works on port 5173 with API proxy to backend.

### Step 6: Telegram bot

Status: **completed**

Commands implemented:
- `/start` — welcome message
- `/login <code>` — link Telegram to account
- `/sessions` — list active sessions
- `/new <title>` — create session
- `/main` — show main session
- `/limits` — show quota balance
- `/remind <text>` — note reminder

Text flow: receive → resolve user → check quota → send to main session → reply.
Voice flow: download → save to workspace/uploads → STT → transcript → send to session.
Gracefully skips when TELEGRAM_BOT_TOKEN not set.

### Step 7: Docker Compose

Status: **completed**

Architecture:
- **backend** (node:20-slim) — Fastify + tsx, ports 3000, volume for data
- **frontend** (nginx:alpine) — React SPA, ports 8080, proxies /api to backend
- Named volume `backend-data` persists SQLite DB and user workspaces
- Healthchecks on both containers
- Frontend waits for backend to be healthy before starting

#### Errors and fixes

1. **`tsconfig.base.json` not found in Docker build** — Dockerfile didn't copy the root tsconfig. Fixed by adding `COPY tsconfig.base.json ./` to frontend Dockerfile.
2. **`composite: true` required** — TypeScript project references need composite mode. Added to packages/shared/tsconfig.json.
3. **`tsc -b` failed in Docker** — Removed `tsc -b` from frontend build script, vite handles TS directly.
4. **Backend healthcheck fails — no curl** — node:20-slim doesn't include curl. Fixed by adding `curl` to apt-get install.
5. **Git commit fails — no user identity** — Container has no git user configured. Fixed by adding `git config --global` to Dockerfile.

Full integration test through nginx proxy passed: register, login, sessions, AGENTS.md, reminders, calendar, skills, search.

### Step 8: Gap fixes

Status: **completed**

All spec gaps addressed:

1. **Auth fixes**: Main session created on registration. Logout endpoint. Secure random login code with 10-minute TTL (replaced insecure userId-based code).
2. **Reminder scheduler**: Background job checks due reminders every 60s, sends Telegram notifications. Daily quota refill runs hourly, grants `dailyQuotaLimit` to all active users once per day.
3. **Marketplace + scanner**: Full marketplace API — catalog CRUD, skill import, `scanSkillPackage` scanner with 10 unsafe patterns (pipe-to-shell, destructive rm, secrets, MCP config, etc.), admin approve/reject, user install to workspace with git commit.
4. **Central demo skills**: 10 manager skills created (executive-summary, meeting-brief, decision-log, daily-plan, risk-analysis, email-draft, calendar-planning, reminder-capture, web-research, task-decomposition). Loaded dynamically from `src/skills/`.
5. **Missing API endpoints**: `GET /api/opencode/agents`, `GET /api/opencode/skills`, `GET /api/opencode/central-skills`, memory CRUD, FTS5-based search with LIKE fallback.
6. **Admin panel UI**: Users list, block/unblock, quota grant, catalog management. Admin link in nav for admin role only.
7. **Telegram commands**: Added /help, /use, /calendar, /settings.
8. **Smoke test**: 21 automated tests — all passing.

### Final status

**21/21 smoke tests passing.**
All stages 0–13 from IMPLEMENTATION_PLAN.md have corresponding implementations.
All Definition of Done items from DEVELOPMENT_SPEC.md are addressed.

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

---

## Session: 2026-06-03 (Review Fix Batch)

### Review fix specification applied

Reference: `docs/REVIEW_FIX_SPEC.md`

All P0 and P1 items from the review have been addressed:

#### P0 blockers fixed

1. **OpenCode API endpoint mapping**: Changed from plural endpoints (`/agents`, `/skills`, `/commands`, `/sessions`) to singular OpenCode server routes (`/agent`, `/skill`, `/command`, `/session`, `/session/:id/message`). Health now calls `/global/health`. All verified with mocked unit tests.

2. **Message body format**: `sendMessage()` now sends `{ parts: [{ type: 'text', text }] }` format. Omits `agent` and `model` when null. No `workspace` or `session` fields in body.

3. **Scanner self-import**: Removed `import type { SkillScanResult, SkillScanStatus } from './scanner.js'` circular self-import.

4. **Quota check on Web chat**: Web messages now check balance before sending. Charge 1 unit for `web_message`. Returns 429 when quota is 0. Refunds on OpenCode failure with `refund_opencode_error`.

5. **Daily quota refill**: Now computes `delta = max(0, dailyLimit - balance)` instead of adding full limit every day. Never raises balance above limit. No zero-delta noise records.

6. **Telegram /new creates real OpenCode session**: Calls `opencodeClient.createSession()` instead of using `local-*` fallback.

7. **Telegram /remind creates real reminders**: Implemented natural language parser supporting: `YYYY-MM-DD HH:MM`, `tomorrow HH:MM`, `today HH:MM`, `in Xm`, `in Xh`. Inserts real `reminders` row.

8. **Marketplace skill content**: Added `marketplace_skills_content` table. Import stores original SKILL.md with sha256. Install copies original content (not regenerated from description). Added metadata.json with source, version, author, sha256, installedAt.

9. **Admin PATCH allowlist**: Replaced mass-assignment with strict Zod schema. Only allows: displayName, role, status, dailyQuotaLimit, language, responseStyle. Rejects passwordHash, id, email, createdAt, updatedAt, welcomeQuotaGranted.

10. **Auth middleware DB-backed**: JWT only trusted for userId identity. Loads user from DB on each request. Rejects if user not found or status !== 'active'. Role comes from DB, not token. Blocked users lose access immediately.

11. **CORS restricted**: Added `CORS_ORIGINS` env variable. Production requires explicit origins. No `origin: true` in any mode.

12. **Local fallback gated**: Added `ALLOW_LOCAL_OPENCODE_FALLBACK` env (default: false). Production never creates `local-*` sessions. Development-only fallback behind explicit flag.

#### P1 hardening applied

1. **Audit log**: Added `audit_log` table and service. Logs: user_registered, login_success, telegram_linked, admin_user_updated, quota_granted, marketplace_skill_imported, marketplace_skill_status_changed, marketplace_skill_installed. Admin audit endpoint returns audit_log, not quota_ledger.

2. **FTS sync**: Added SQLite triggers (`messages_fts_insert`, `messages_fts_delete`, `messages_fts_update`) to automatically sync messages to FTS5 index.

3. **AGENTS.md commits**: PUT /api/me/agents-md now validates content (non-empty, max 100KB), writes file, and commits to workspace git with fixed author.

4. **Skill slug validation**: All skill endpoints (GET, POST, PUT, DELETE) now validate slug with same regex. Content size validation added (max 100KB).

5. **Build system**: Switched from `tsc` to `esbuild` for backend build (pragmatic — tsx works fine for dev, esbuild for production bundles).

#### Tests added (51 tests, all passing)

- OpenCodeClient endpoint mapping (9 tests)
- OpenCodeClient omits agent/model when null
- Workspace path escape attempts (5 tests)
- Admin PATCH allowlist/reject (9 tests)
- Reminder parser patterns (7 tests)
- Daily quota refill logic (5 tests)
- Skill slug validation (8 tests)
- Marketplace scanner patterns (8 tests)

#### Env changes

Added to `.env.example`:
- `ALLOW_LOCAL_OPENCODE_FALLBACK=false`
- `CORS_ORIGINS=http://localhost:5173`

---

## Session: 2026-06-04 (P2 demo polish + guided demo)

### Step 9: Manager service and P2 demo polish

Status: **completed**

Implemented the missing P2 demo polish items from `REVIEW_FIX_SPEC.md`:

- `services/manager.ts` — context builders for the four core manager skills.
- `routes/manager.ts` — REST endpoints exposed to Web UI.
- Updated Telegram bot with `/daily`, `/find`, `/meeting`, `/voice` commands.
- Rewrote 4 central skills to describe the structured input they receive:
  - `daily-plan/SKILL.md`
  - `meeting-brief/SKILL.md`
  - `find-context/SKILL.md`
  - `voice-action-summary/SKILL.md`
- Added 13 vitest tests for the manager service.
- `scripts/seed-demo.ts` — seeds `demo@moca.local` with workspace, sessions, reminders, calendar events, memory items.
- Expanded `smoke-test.sh` to 30 steps.
- `scripts/run-smoke.sh` — spins up a local backend, runs the smoke test, cleans up.
- Added `GET /api/me/workspace` for smoke-test workspace verification.
- Updated `README.md` with a full 16-step guided demo scenario.
- Updated root `package.json` with `seed` and `smoke` scripts.

#### Manager service details

`buildDailyPlanContext(userId)`:
- Pulls today's calendar events.
- Pulls pending reminders.
- Pulls last 10 memory items.
- Pulls last 10 messages.
- Detects time-window conflicts between events.
- Builds a structured prompt for the `daily-plan` skill.

`buildFindContext(userId, query)`:
- Searches `messages_fts` (FTS5) for the query.
- Falls back to LIKE search when FTS fails.
- Also searches `memory_items` by content.
- Builds a structured prompt for the `find-context` skill.

`buildMeetingBrief(notes)`:
- Tokenises by sentence, then runs pattern-based extraction:
  - Decisions (English + Russian)
  - Action items with owner + deadline via per-sentence deadline scan
  - Risks (English + Russian)
  - Follow-ups and TODO lines
- Builds a structured prompt for the `meeting-brief` skill.

`buildVoiceActionSummary(transcript)`:
- Splits transcript by sentence terminators.
- Detects reminder triggers (`remind me to`, `напомни мне`).
- Detects task triggers (`need to`, `must`, `сделать`, `нужно`).
- Builds a structured prompt for the `voice-action-summary` skill.

#### Tests added (13 new, 64 total)

- `getTodayDate` returns `YYYY-MM-DD`.
- `getTodayDate` falls back on unknown timezone.
- `buildMeetingBrief` extracts English decisions.
- `buildMeetingBrief` extracts Russian decisions.
- `buildMeetingBrief` extracts action items with owner + deadline.
- `buildMeetingBrief` extracts risks and follow-ups.
- `buildMeetingBrief` returns empty arrays on blank input.
- `buildMeetingBrief` produces a non-empty prompt with raw notes.
- `buildVoiceActionSummary` detects English reminder triggers.
- `buildVoiceActionSummary` detects English task triggers.
- `buildVoiceActionSummary` detects Russian triggers.
- `buildVoiceActionSummary` returns no actions on plain prose.
- `buildVoiceActionSummary` handles multiple sentences.

#### Errors and fixes during this batch

1. **Lazy regex captured single chars instead of full tasks** — `[^\.]+?` with optional deadline group was committing early because the optional group can fail. Refactored to a two-step approach: extract action candidate by per-sentence scan, then run a separate `extractDeadline()` helper on the sentence text.
2. **`to` was too greedy in action verb alternation** — `"Anna to prepare"` matched and polluted the owner field. Removed `to` from the alternation; the engine now matches stronger verbs (`will`, `should`, `needs to`, `must`, `has to`).
3. **`.env` not loaded when running `npm run seed -w @moca/backend`** — `dotenv.config()` looks for `.env` in `process.cwd()`, but `npm` changes cwd to the workspace directory. Fixed `env.ts` to walk up to 8 parent directories looking for `.env`.
4. **Smoke test `USER_A_ID` unbound variable** — `set -uo pipefail` plus a missing var caused the script to abort. Guarded with `if [ -n "$USER_A_ID" ]`.
5. **EADDRINUSE conflict with running `moca-backend` container** — the running Docker container kept the port. Switched `run-smoke.sh` to spawn a local backend on port 3300 by default (`SMOKE_PORT=3300`).
6. **Smoke test cleanup at wrong paths** — DB and workspaces were at `data/app.db` and `data/backend/workspaces/`, not `data/backend/app.db` and `data/workspaces/`. Updated cleanup to handle both layouts.

#### Final status after P2 polish

- **30/30 smoke test steps pass** (`scripts/run-smoke.sh`)
- **64/64 vitest unit tests pass**
- Build passes (esbuild for backend, vite for frontend)
- Seed creates demo user with 1 main session, 3 reminders, 5 calendar events, 5 memory items
- Telegram bot responds to all 16 manager commands
- Manager endpoints exposed at `/api/manager/*` for Web UI
- Guided demo scenario documented in README (16 steps)

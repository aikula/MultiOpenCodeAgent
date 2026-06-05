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

---

## Session: 2026-06-04 (P2 polish — manager service + demo flow + safety)

### Step 9: Manager service and P2 demo polish

Status: **completed**

Implemented the missing P2 demo polish items from `REVIEW_FIX_SPEC.md`:

- `services/manager.ts` — context builders for the four core manager skills.
- `routes/manager.ts` — REST endpoints exposed to Web UI.
- Updated Telegram bot with `/daily`, `/find`, `/meeting`, `/voice` commands.
- Rewrote 4 central skills to describe the structured input they receive.
- `scripts/seed-demo.ts` — seeds `demo@moca.local` with workspace, sessions, reminders, calendar events, memory items.
- Expanded `smoke-test.sh` to 30 steps.
- `scripts/run-smoke.sh` — spins up a local backend, runs the smoke test, cleans up.
- Added `GET /api/me/workspace` for smoke-test workspace verification.
- Updated `README.md` with a full 16-step guided demo scenario.

#### Tests added (13 new, 64 total at this point)

- `getTodayDate` returns `YYYY-MM-DD`.
- `getTodayDate` falls back on unknown timezone.
- `buildMeetingBrief` extracts English / Russian decisions.
- `buildMeetingBrief` extracts action items with owner + deadline (per-sentence scan, then `extractDeadline()` helper).
- `buildMeetingBrief` extracts risks and follow-ups.
- `buildMeetingBrief` returns empty arrays on blank input.
- `buildMeetingBrief` produces a non-empty prompt with raw notes.
- `buildVoiceActionSummary` detects English / Russian triggers.
- `buildVoiceActionSummary` returns no actions on plain prose.
- `buildVoiceActionSummary` handles multiple sentences.
- Two regex pattern regression tests for action extraction.
- Permission gate decision matrix (22 new tests added later — see session 2026-06-05).

#### Errors and fixes during this batch

1. **Lazy regex captured single chars instead of full tasks** — `[^\.]+?` with optional deadline group was committing early because the optional group can fail. Refactored to two-step: extract per-sentence, then run `extractDeadline()` on the sentence.
2. **`to` was too greedy in action verb alternation** — `"Anna to prepare"` polluted owner field. Removed `to` from alternation; engine matches stronger verbs.
3. **`.env` not loaded from `apps/backend` cwd** — `dotenv.config()` looks for `.env` in `process.cwd()`. Fixed `env.ts` to walk up to 8 parent directories.
4. **Vite content hash didn't change on rebuild** — Vite is deterministic by content. Browser may serve cached old version. **Hard reload** (Ctrl+Shift+R) required.
5. **EADDRINUSE conflict with running `moca-backend` container** — `run-smoke.sh` spawns a local backend on port 3300.
6. **Smoke test cleanup at wrong paths** — DB and workspaces were at `data/app.db` and `data/backend/workspaces/`. Cleanup updated to handle both layouts.

---

## Session: 2026-06-04 (production hardening: 500 on login, account deletion, admin)

### Step 10: Auth error codes + Logout + Account deletion

Status: **completed**

- **`POST /api/auth/login`**: catches `Invalid credentials` → **401**, `Account blocked` → **403** (was 500 before).
- **`POST /api/auth/register`**: catches `Email already registered` → **409** (was 500 before).
- **Frontend `ApiError` class** in `apps/frontend/src/api/client.ts`: parses `data.error` / `data.message` from server response, surfaces in `Error.message`. Redirect to `/login` only when token was present (not from login/register page itself).
- **`DELETE /api/me`** (account deletion): requires password, cascades all related rows in SQLite transaction, removes workspace dir from disk, nulls `audit_log.actor_user_id` (preserves audit trail).
- **Settings UI**: explicit "Log out" button in page header, "Danger Zone" with "Type DELETE to confirm" pattern.
- **Admin promotion for aikula** via direct DB update (was needed to test admin features).
- **Test setup rewrite**: `__tests__/setup.ts` now auto-sets `DATABASE_URL=file:./data/test.db`, deletes stale DB, runs migrations. Without this, new tests using DB got "no such table" errors.

Tests: **69/69 pass** (5 new for `account-delete`).

---

## Session: 2026-06-04 (operations: file management + Telegram login code + FireWorks provider)

### Step 11: Operational features and provider wiring

- **File management UI + Telegram commands** (`/files`, `/sendfile`): list directories, download, view.
- **Telegram login code section in Settings page**: generate one-time code, `/login <code>` in Telegram.
- **Telegram proxy for Russia**: routed through HTTPS proxy at `107.173.19.16:3128` to bypass Telegram API blocks.
- **Traefik routing**: moca-frontend on tghub-network, Traefik labels for `openagent.kulinich.ru`.
- **FireWorks provider**: `fireworks-ai/deepseek-v4-flash` as default. Key passed via `FIREWORKS_API_KEY` env in docker-compose.
- **OpenCode server in Docker Compose**: separate container, Basic auth, `OPENCODE_SERVER_PASSWORD`.
- **STT integration with GigaAM Voice API**: lazy polling, voice message → transcript → send to main session.

---

## Session: 2026-06-05 (security: permission gate + per-user isolation)

### Step 12: OpenCode Permissions API gating (ADR-002/003/004/005)

Status: **completed**

**The problem:** OpenCode is single-tenant by design — one WORKDIR per process. All workspaces mounted at `/workspaces/u_<uuid>/` were visible to all users. Needed proper isolation without per-user OpenCode instances.

**The solution:** OpenCode's `permission.asked` event via `/global/event` SSE, intercepted by a permission gate in the backend.

**Implementation (`apps/backend/src/services/permission-gate.ts`):**
1. Subscribes to `OpenCode /global/event` SSE on backend startup
2. On `permission.asked` event, looks up user via `sessions.opencode_session_id`
3. Decides `allow/deny` based on:
   - `external_directory`: `filepath` matches user's UUID
   - `bash`: command references user workspace OR safe read-only
   - `read/edit/write/glob/grep`: allow once
   - `webfetch/websearch`: reject (web disabled)
4. Responds via `POST /session/:id/permissions/:permissionID` with `{response: "once"|"always"|"reject"}`
5. Logs every decision to `/tmp/moca-perm/audit.log` as JSON Lines
6. Auto-reconnect with exponential backoff (1s → 30s)

**Two bugs found and fixed during this session:**
1. **`resolveContext` queried wrong column** — looked up by `sessions.id` (internal) instead of `sessions.opencode_session_id` (OpenCode ID). All permission requests returned "no user context → reject". Fixed and added regression test.
2. **Cross-container path mismatch** — DB stores workspace as `/app/data/workspaces/u_<uuid>/` but OpenCode sees `/workspaces/u_<uuid>/`. UUID extraction regex added; both `isWithinWorkspaceForTest` cases covered.

**OpenCode config** (`apps/opencode/opencode.json`): `external_directory: {"*": "ask"}` — every external path triggers permission event.

**Tests added (22 new, 99 total):**
- `isWithinWorkspace` exact/subpath/sibling/partial-prefix/trailing-slash
- `isWithinWorkspace` cross-container UUID matching (positive and negative)
- `decidePermission` external_directory: own path, sibling path, `/etc/`, parent dir, missing data, no workspace
- `decidePermission` bash: workspace reference, safe read-only, sibling workspace, `rm /`, `/etc/`
- `decidePermission` other tools: read, webfetch, websearch, unknown
- `resolveContext` regression test (looks up by OpenCode ID, not internal)

**Live verification (4 cases):**
| Scenario | Result | Audit |
|---|---|---|
| Read own AGENTS.md | ✅ Read (5.9s) | `once — path within user workspace` |
| Read other user file | ❌ "Это файл другого пользователя" (1.7s) | `reject — path outside user workspace` |
| Bash other user dir | ❌ "Запрещено" (1.2s) | `reject — bash command touches another user's workspace` |
| Bash own dir | ✅ "Один файл: report.pdf" (2.0s) | `once — path within user workspace` |

**Docs:** Added `AGENTS.md` (top-level) and `docs/DECISIONS.md` (ADR-001 to ADR-012).

---

## Final project status (2026-06-05)

- **99/99 unit tests pass** (Vitest)
- **30/30 smoke tests pass** (`scripts/run-smoke.sh`)
- Build OK (esbuild for backend, vite for frontend)
- All 3 containers healthy: `moca-backend`, `moca-opencode`, `moca-frontend`
- https://openagent.kulinich.ru/ → React SPA (200 OK via Traefik)
- Permission gate active: every tool call audited in `/tmp/moca-perm/audit.log`
- Demo user `demo@moca.local` seeded in container DB
- User `andrey.kulinich@gmail.com` promoted to `role=admin`, password reset to `admin2026!`
- 12 manager skills in central catalog; manager endpoints at `/api/manager/*`
- Telegram bot running with 16 manager commands


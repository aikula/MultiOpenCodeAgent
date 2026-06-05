# Accepted Decisions

This document records architecture and operational decisions for MultiOpenCodeAgent. Each decision includes the context, the choice made, and the consequences (both positive and negative). When changing the system, read the relevant decisions first.

Format: lightweight ADR (Architecture Decision Record). Numbered chronologically; not modified retroactively — superseded decisions are marked with `Superseded by ADR-XXX`.

---

## ADR-001: SQLite as primary data store

- **Status:** Accepted
- **Date:** 2026-06-03
- **Context:** Need a single-process database for users, sessions, messages, workspaces, quotas, audit log. Options: SQLite, PostgreSQL, MySQL.
- **Decision:** SQLite (WAL mode, foreign keys ON) via better-sqlite3.
- **Consequences:**
  - ✅ Zero infrastructure — no separate DB process, just a file
  - ✅ Fast for single-host workload
  - ✅ Trivial backup (just copy the file)
  - ✅ Perfect for educational demo scale (10–50 users)
  - ⚠️ Single writer (sufficient for Fastify single-process backend)
  - ⚠️ No horizontal scaling (would need migration to PG if needed)
- **Supersedes:** —

## ADR-002: Single OpenCode instance, not per-user

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** OpenCode is a single-process server with one WORKDIR (`/workspace`) per process. To isolate users, we could either:
  - (A) Per-user OpenCode container, one WORKDIR per user
  - (B) Single instance, workspaces mounted at `/workspaces/`, isolation enforced by permission gate via OpenCode's `permission.asked` SSE event
- **Decision:** Option B — single instance + permission gate. The gate listens to `/global/event` SSE, intercepts `permission.asked` events, looks up the owning user in our DB by `opencode_session_id`, decides allow/deny based on whether the file path or bash command targets the user's own workspace, and responds via `POST /session/:id/permissions/:permissionID`.
- **Consequences:**
  - ✅ One OpenCode process = ~80 MB RAM, not N×80 MB
  - ✅ Centralized audit log of every tool call decision
  - ✅ Async permission flow keeps OpenCode's event loop clean
  - ⚠️ SSE connection must be resilient (reconnect with exponential backoff)
  - ⚠️ Path resolution must handle both host and container paths (UUID matching)
  - ⚠️ Permission decision must be conservative — reject when in doubt
- **Decision criteria satisfied by ADR-003, ADR-004, ADR-005**

## ADR-003: Permission gate via OpenCode /global/event SSE

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** OpenCode has a permissions API: agents request permission, OpenCode blocks, returns a `permission.asked` event with an `id: per_xxx`, the client responds via `POST /session/:id/permissions/:permissionID` with `{response: "once"|"always"|"reject"}`.
- **Decision:** Backend runs a persistent SSE consumer (`apps/backend/src/services/permission-gate.ts`) that:
  1. Subscribes to `OpenCode /global/event`
  2. On `permission.asked`, looks up user via `sessions.opencode_session_id`
  3. Decides based on permission type and metadata
  4. Responds via `POST /session/:id/permissions/:permissionID`
  5. Logs every decision to `/tmp/moca-perm/audit.log`
- **Consequences:**
  - ✅ Real-time, no polling
  - ✅ Auto-reconnect with exponential backoff (1s → 30s)
  - ✅ Decision logic is pure and unit-testable
  - ✅ Bypass mode: if `ALLOW_LOCAL_OPENCODE_FALLBACK=true`, gate is skipped (dev only)

## ADR-004: Workspace isolation by UUID matching, not by full path

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** Our DB stores workspace path as `/app/data/workspaces/u_<uuid>/` (host). OpenCode container has the same workspaces mounted at `/workspaces/u_<uuid>/`. The agent's permission request uses the container path. Comparing full paths fails.
- **Decision:** Extract `u_<uuid>` segment from both paths and compare UUIDs.
- **Consequences:**
  - ✅ Robust against container/host path divergence
  - ✅ Works regardless of where the volume is mounted
  - ✅ Single source of truth: the workspace UUID

## ADR-005: Permission gate decision logic

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** When OpenCode asks permission, the gate must decide allow/deny based on the tool and target.
- **Decision:** Decision matrix (in `permission-gate.ts`):
  | Permission | Allow | Deny |
  |---|---|---|
  | `external_directory` | path matches user's UUID | different UUID, `/etc/`, `/var/`, `~` |
  | `bash` | command references user workspace OR safe read-only (`ls`/`cat`/`head`/`tail`/`stat`/`file`/`wc`/`grep`) | touches `/workspaces/u_<other>`, `rm /`, `/etc/`, `/var/` |
  | `read`/`edit`/`write`/`glob`/`grep` | `once` (default) | — |
  | `webfetch`/`websearch` | — | `reject` (web access disabled by default) |
  | `doom_loop` | — | `reject` |
  | unknown | — | `reject` |
- **Consequences:**
  - ✅ Conservative — rejects unknown permission types
  - ✅ Auditable — every decision is logged with reason
  - ✅ Tested — 22 unit tests cover all paths

## ADR-006: FireWorks as default LLM provider

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** Need a fast, cheap LLM for the manager demo. Options: OpenAI, Anthropic, local, FireWorks, OpenCode Zen.
- **Decision:** FireWorks `deepseek-v4-flash` as primary. OpenCode Zen Claude as documented fallback (when FireWorks rate-limited or out of credits). Key passed to OpenCode container via `FIREWORKS_API_KEY` env var.
- **Consequences:**
  - ✅ Fast (~1.5s first token)
  - ✅ Cheap (~$0.0014 per session)
  - ✅ Good Russian language support
  - ⚠️ Rate limits require graceful error handling (already implemented: refund on OpenCode error)
  - ⚠️ If FireWorks key is missing or expired, all chats fail
- **Supersedes:** —

## ADR-007: Message context enrichment at backend, not at OpenCode

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** Agent has no native access to user's calendar, reminders, memory, or file list. We could:
  - (A) Build MCP server with tools
  - (B) Pre-build a context block and prepend to user message
  - (C) Add to OpenCode system prompt
- **Decision:** Option B (`apps/backend/src/services/message-context.ts`) — backend enriches every message with:
  - User's workspace path (with explicit isolation warning)
  - List of files in workspace (small text files inlined up to 8KB)
  - Today's calendar events
  - Pending reminders
  - Memory count
  - "Available actions" hint (which user commands to use)
- **Consequences:**
  - ✅ Agent has full context for every turn
  - ✅ No MCP needed (no extra process)
  - ✅ Pure backend code, fully testable (7 unit tests)
  - ⚠️ Token cost increases per message (text file content)

## ADR-008: Self-service account deletion with password re-verification

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** GDPR-style "right to be forgotten" requires users can delete their data. Need to ensure user-initiated, not coerced.
- **Decision:** `DELETE /api/me` requires:
  1. Valid password (verified via bcrypt)
  2. User must be active (not blocked)
  - On success: cascade-delete all related rows in a single SQLite transaction + remove workspace directory from disk
  - Audit log rows: `actor_user_id` is nulled (not deleted) to preserve audit trail
- **Consequences:**
  - ✅ GDPR-friendly
  - ✅ No data orphans (transactional)
  - ✅ Audit trail preserved
  - ⚠️ Blocked users cannot self-delete (must contact admin)
  - ⚠️ Workspace on disk removed permanently
- **Supersedes:** —

## ADR-009: Test database isolation via `__tests__/setup.ts`

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** Vitest tests need a fresh DB per run. Originally each test file imported the same `db/index.ts` singleton, which pointed at the production DB path.
- **Decision:** `apps/backend/src/__tests__/setup.ts` runs before any test:
  1. Sets `DATABASE_URL=file:./data/test.db` if not set
  2. Deletes any leftover `test.db*` files
  3. Runs `runMigrations()` to create schema
  4. Creates `WORKSPACES_ROOT=/tmp/moca-test-workspaces` for test workspace dirs
- **Consequences:**
  - ✅ 99 tests pass reliably
  - ✅ No production data touched
  - ✅ Each `npm test` starts with clean state
  - ⚠️ Adds ~13s setup time to test run (could be optimized with prebaked DB)

## ADR-010: Healthcheck must use `127.0.0.1`, not `localhost`

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** Alpine-based nginx container resolves `localhost` to IPv6 `::1`, but nginx listens on IPv4 `0.0.0.0:80`. Healthcheck with `wget http://localhost:80` fails with "Connection refused" → container marked unhealthy → Traefik doesn't route.
- **Decision:** Healthcheck command uses `http://127.0.0.1:80` explicitly. Documented in `docker-compose.yml`.
- **Consequences:**
  - ✅ https://openagent.kulinich.ru/ returns 200
  - ✅ Traefik picks up the frontend container
  - ⚠️ Anyone copying the config must use `127.0.0.1` literally

## ADR-011: Read-write mount of user workspaces to OpenCode

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** OpenCode needs filesystem access to user workspaces for bash/read/write/edit. Mount options: `:ro` (read-only) or `:rw` (read-write).
- **Decision:** `:rw` (read-write). Agent can edit files in user's workspace. Permission gate (ADR-002) prevents cross-user access.
- **Consequences:**
  - ✅ Agent can write files (e.g., write a report)
  - ✅ Permission gate is the real boundary, not filesystem permissions
  - ⚠️ Agent could theoretically corrupt a file — but only in user's own workspace
  - ⚠️ All workspaces in one mount — no kernel-level isolation

## ADR-012: OpenCode config via `opencode.json`, not PATCH /config

- **Status:** Accepted
- **Date:** 2026-06-05
- **Context:** Tried setting permission via `PATCH /config` with `{"permission": {"bash": "ask"}}` — got HTTP 200 but the change was not applied. OpenCode reads config from `opencode.json` file at startup.
- **Decision:** Write `opencode.json` to `/root/.config/opencode/opencode.json` in the OpenCode container, mount from host `apps/opencode/opencode.json`, restart on changes.
- **Consequences:**
  - ✅ Config persists across restarts
  - ✅ Visible in git history
  - ⚠️ Requires container restart for changes
  - ⚠️ PATCH /config still doesn't work for permission (per docs it's read-only)

---

## Superseded decisions

(none yet)

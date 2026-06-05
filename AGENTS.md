# MultiOpenCodeAgent

Multi-user educational agent platform built around a centralized OpenCode server. Manager workflows through Telegram bot, Web UI, sessions, user-isolated workspaces, central skills, marketplace, reminders, calendar, search, voice transcription, and usage limits.

## Quick start

```bash
# 1. Start OpenCode server (port 4096)
# 2. Start backend (port 3000) and frontend (port 80)
docker compose up -d

# 3. Seed demo user (demo@moca.local / demo-password-2026)
npm run seed

# 4. Run all unit tests
npm test
# 99/99 pass

# 5. Run end-to-end smoke test (auto-spawns local backend on :3300)
bash scripts/run-smoke.sh
# 30/30 pass

# 6. Send message to backend (existing infra on :3000)
SPAWN=0 ./smoke-test.sh http://127.0.0.1:3000
```

## Live deployments

| Service | URL | Notes |
|---|---|---|
| Web UI | https://openagent.kulinich.ru/ | Fronted by Traefik, terminates TLS |
| Backend | http://172.19.0.3:3000 (container) | Internal on `multiopencodeagent_default` network |
| OpenCode | http://moca-opencode:4096 (container) | Basic auth, single instance |
| Telegram bot | @MultiOpenCodeAgentBot | Token in `.env`, uses HTTPS proxy for Telegram API |

## Project structure

```
apps/
  backend/        Fastify + tsx + TypeScript
    src/
      auth/         Registration, login, login-codes, account deletion
      db/           Drizzle schema + migrations + FTS5
      opencode/     OpenCode HTTP client (health, sessions, message)
      routes/       Fastify routes (auth, sessions, settings, ...)
      services/     auth, workspace, quota, scheduler, scanner,
                    account-delete, message-context, permission-gate,
                    manager
      telegram/     Bot with /daily /find /meeting /voice /remind
      stt/          GigaAM Voice STT
      skills/       Central manager skills (daily-plan, meeting-brief, ...)
      scripts/      seed-demo.ts
  frontend/       Vite + React + TypeScript + Tailwind
    src/
      pages/        Login, Chat, Reminders, Calendar, Skills, Files, Settings, Admin
      components/   Layout
      hooks/        useAuth
      api/          client
  opencode/       OpenCode AI server + config (singleton, see DECISIONS.md)
packages/
  shared/          Zod schemas + shared types
docs/              Specs, dev log, decisions, skills guide
data/              Runtime: SQLite DB, user workspaces (git-init'd), OpenCode cache
```

## Architecture in one diagram

```
Telegram bot  ─┐
Web UI        ─┤
               ▼
        Fastify backend (port 3000)
          ├─ Auth (JWT) + quota_ledger
          ├─ User workspace (git init, AGENTS.md, memory/)
          ├─ Sessions + messages (mirrored to OpenCode)
          ├─ Reminders / calendar / memory
          ├─ Permission gate (SSE → OpenCode /global/event)
          └─ OpenCode client
               │
               ▼
       OpenCode server (port 4096)
          ├─ bash / read / write / edit / glob / grep
          └─ x-opencode-directory header for file API
               │
               ▼
       FireWorks (deepseek-v4-flash) or OpenCode Zen
```

The user data plane is **always** a single OpenCode instance; isolation is enforced by the permission gate (see DECISIONS.md).

## Key docs

- `docs/DEVELOPMENT_SPEC.md` — original spec, hard rules
- `docs/IMPLEMENTATION_PLAN.md` — stages 0–13, smoke test plan, release gate
- `docs/REVIEW_FIX_SPEC.md` — P0/P1 fixes from review
- `docs/DEV_LOG.md` — chronological implementation log
- `docs/SKILLS_AGENTS_AND_MARKETPLACE.md` — central skills + marketplace rules
- `docs/DECISIONS.md` — **accepted architecture / operational decisions (read this when changing anything)**
- `docs/CODE_AGENT_INSTRUCTIONS.md` — original agent instructions (symlinked as `CLAUDE.md`)

## Conventions

- TypeScript strict; backend runs via `tsx` (no build step in container)
- Frontend builds via Vite → static SPA
- SQLite at `data/backend/app.db` (WAL mode, foreign keys ON)
- Drizzle schema in `apps/backend/src/db/schema.ts`; migrations applied at boot
- FTS5 triggers keep `messages_fts` in sync with `messages`
- All API routes validate with Zod
- Quota: welcome grant (default 30) + daily refill (default 20/day) + admin grant
- Tests: Vitest, `data/test.db` (fresh per run), 99 unit tests

## Quick checks

```bash
# Health
curl -s http://127.0.0.1:3000/health
curl -s -u opencode:opencode-secret http://127.0.0.1:4096/global/health

# List users
docker exec moca-backend sh -c "node -e 'const db=require(\"better-sqlite3\")(\"/app/data/app.db\"); console.log(db.prepare(\"SELECT email, role, status FROM users\").all())'"

# Audit log of permission decisions
docker exec moca-backend cat /tmp/moca-perm/audit.log | tail -20

# Tail backend logs
docker logs moca-backend --tail 50 -f
```

## Production runbook

- **OpenCode hung** → `docker compose restart opencode` (sessions persist in our DB; orphan OpenCode sessions cause "fetch failed" — recreate via `POST /session` and `UPDATE sessions SET opencode_session_id=?` in DB)
- **Permission gate stuck** → check `/tmp/moca-perm/audit.log` for last decision; restart `moca-backend`
- **Wrong credentials leaked** → rotate JWT_SECRET in `.env` and `docker compose up -d backend` (all sessions invalidated)
- **Quota exhausted** → admin grants via `POST /api/admin/users/:id/quota` or wait for daily refill (hourly scheduler)
- **Telegram 409 conflict** → only one bot instance at a time; kill duplicates

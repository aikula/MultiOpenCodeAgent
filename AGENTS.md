# MultiOpenCodeAgent

Multi-user educational agent platform built around a centralized OpenCode server. The product must demonstrate strict agentic manager workflows through Telegram bot, Web UI, sessions, user-isolated workspaces, central skills, MCP, reminders, calendar, search, voice transcription, files and usage limits.

## Non-negotiable principle: strict agent mode

This repository must be developed in **strict agent mode**.

Strict agent mode means:

- natural language text and voice are the primary interface;
- slash commands are optional shortcuts, not the main UX;
- the system must perform supported actions instead of telling the user to open another page;
- reminders, calendar events, search, meeting briefs, decisions, risk reviews, daily plans and email drafts must work from ordinary user messages;
- every executed action must be saved both to the platform database and to the active session history;
- Web UI pages are for visibility, correction and admin work, not a substitute for agent execution.

The core demo sentence must work in both Web and Telegram:

```text
Напомни завтра в 10 написать Ивану по договору и подготовь план встречи
```

Expected behavior:

1. Reminder is created.
2. Meeting plan is generated.
3. Result is saved in the main session.
4. User receives a short confirmation.

The assistant must not answer with "use /remind" or "open the Calendar page" for supported actions.

## Quick start

```bash
# 1. Start OpenCode server, backend and frontend
docker compose up -d

# 2. Seed demo user (demo@moca.local / demo-password-2026)
npm run seed

# 3. Run all unit tests
npm test

# 4. Run end-to-end smoke test
bash scripts/run-smoke.sh
```

## Runtime decision

Use `opencode serve` as the primary runtime. The CLI is allowed only for diagnostics, one-time setup and admin maintenance.

The backend is the only component allowed to call OpenCode. Frontend and Telegram must call the backend only.

OpenCode Server is used because it provides HTTP API, OpenAPI docs, health, events, sessions, messages, commands, MCP status, agent list and permissions APIs.

## OpenCode configuration

Global OpenCode config lives in:

```text
apps/opencode/opencode.json
```

It must include:

- central `manager` primary agent;
- central MCP servers `context7` and `gh_grep`;
- strict agent mode instructions;
- no public exposure of OpenCode outside Docker/internal network.

## Skills policy

OpenCode skills are filesystem skills. Do not fake skills through `/command`.

Central skills source path in this repository:

```text
apps/opencode/skills/<skill-name>/SKILL.md
```

Runtime path inside OpenCode container:

```text
/root/.config/opencode/skills/<skill-name>/SKILL.md
```

User skills path:

```text
/workspaces/u_<uuid>/.opencode/skills/<skill-name>/SKILL.md
```

Rules:

- built-in OpenCode agents and skills must stay visible;
- central skills are managed by admin and installed globally;
- user skills are private to the user workspace;
- imported skills cannot add MCP configuration;
- `/command` is for commands, not skills;
- skill names must match OpenCode naming rules.

Required central skills:

- daily-plan
- meeting-brief
- find-context
- reminder-capture
- calendar-planning
- voice-action-summary
- decision-log
- risk-analysis
- email-draft
- executive-summary
- task-decomposition
- web-research
- docs-lookup
- github-code-search
- browser-research
- manager-action-router
- meeting-followup
- executive-email

## Central MCP policy

Only central MCP is allowed in v1. Users cannot add MCP servers.

Required MCP servers:

- `context7` for current documentation lookup;
- `gh_grep` for public GitHub code search.

Admin UI should show MCP status using OpenCode MCP API.

## Project structure

```text
apps/
  backend/        Fastify + TypeScript
    src/
      auth/       Registration, login, login-codes, account deletion
      db/         Drizzle schema + migrations + FTS5
      opencode/   OpenCode HTTP client
      routes/     Fastify routes
      services/   auth, workspace, quota, scheduler, action-router,
                  account-delete, message-context, permission-gate,
                  manager
      telegram/   Bot with strict agent mode routing
      stt/        STT adapter
      scripts/    seed-demo.ts
  frontend/       Vite + React + TypeScript
  opencode/       OpenCode server config and central skills
packages/
  shared/          Zod schemas + shared types
docs/              Specs, dev log, decisions, skills guide
data/              Runtime: SQLite DB, user workspaces, OpenCode cache
```

## Key docs

- `docs/STRICT_AGENT_MODE_AND_OPENCODE_RUNTIME.md` — strict agent mode, OpenCode runtime, skills and MCP
- `docs/DEVELOPMENT_SPEC.md` — original spec, hard rules
- `docs/IMPLEMENTATION_PLAN.md` — stages, smoke test plan, release gate
- `docs/REVIEW_FIX_SPEC.md` — review fixes
- `docs/DEV_LOG.md` — chronological implementation log
- `docs/SKILLS_AGENTS_AND_MARKETPLACE.md` — central skills + marketplace rules
- `docs/DECISIONS.md` — accepted architecture / operational decisions
- `docs/CODE_AGENT_INSTRUCTIONS.md` — original coding agent instructions

## Development priorities now

P0:

- implement `apps/backend/src/services/action-router.ts`;
- route Web chat messages through action router;
- route Telegram text and STT transcripts through action router;
- stop using skill names as agent IDs unless those agents really exist;
- stop using `/command` as a fake skills endpoint;
- install central skills into `apps/opencode/skills` and mount/copy them to OpenCode global skills path;
- expose MCP status in admin UI;
- make the core Russian demo sentence pass end-to-end.

## Conventions

- TypeScript strict.
- SQLite with WAL and foreign keys.
- All user data access must be filtered by authenticated user ID.
- Workspace path must be derived from DB, not client input.
- Every workspace is a git repo.
- Quota: welcome grant plus daily refill plus admin grant.
- Tests must cover isolation, action routing, reminders, calendar, skills and MCP status.

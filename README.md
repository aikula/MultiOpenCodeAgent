# MultiOpenCodeAgent

MultiOpenCodeAgent is a multi-user educational agent platform built around a single centralized OpenCode server.

The project goal is to quickly demonstrate useful manager workflows through agents:

- Telegram text and voice interaction;
- Web chat with session history;
- user-isolated workspaces, memory, sessions and settings;
- personal `AGENTS.md`;
- default OpenCode agents and skills;
- curated central skills and user skills;
- optional import from trusted skill catalogs;
- centralized MCP only;
- reminders, calendar tasks, search and daily planning;
- usage limits and admin controls.

## Documentation

Start here:

- [`AGENTS.md`](AGENTS.md) — top-level project context: how to run, architecture, conventions, runbook
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — accepted architecture / operational decisions (read this when changing anything)
- [`docs/DEVELOPMENT_SPEC.md`](docs/DEVELOPMENT_SPEC.md) — main development specification for the coding agent
- [`docs/SKILLS_AGENTS_AND_MARKETPLACE.md`](docs/SKILLS_AGENTS_AND_MARKETPLACE.md) — mandatory rules for OpenCode default agents, default skills, custom skills and skill-market import
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — implementation phases, checklists and acceptance criteria
- [`docs/DEV_LOG.md`](docs/DEV_LOG.md) — chronological implementation log
- [`docs/CODE_AGENT_INSTRUCTIONS.md`](docs/CODE_AGENT_INSTRUCTIONS.md) — direct instructions for the coding agent (symlinked as `CLAUDE.md`)

## Core architectural decision

Do not build a new agent runtime.

Build a control-plane around OpenCode:

```text
Telegram Bot / Web UI
        |
        v
Platform API / Gateway
  - auth
  - users
  - quotas
  - sessions
  - search
  - reminders
  - calendar
  - STT adapter
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

## Non-goals for v1

The first version must not support:

- user-managed MCP servers;
- user plugins;
- user custom tools;
- BYOK provider credentials;
- direct external access to OpenCode;
- shared sessions between users;
- Telegram groups;
- shell execution except a tiny explicit allowlist.

We need a working educational platform, not a lovingly overengineered security incident with a web interface.

## Guided demo scenario

The complete manager scenario runs end-to-end through both Web UI and Telegram. Use it for live demos and acceptance reviews.

### One-time setup

```bash
# 1. Start OpenCode server (required)
# 2. Start backend and frontend
docker compose up -d

# 3. Seed demo data (creates demo@moca.local with rich context)
npm run seed -w @moca/backend
```

Demo credentials:

```text
email:    demo@moca.local
password: demo-password-2026
```

### Demo flow

| # | Step | Channel | What happens |
|---|------|---------|--------------|
| 1 | Log in as demo user | Web UI | Main session, workspace, memory all pre-populated |
| 2 | Open Chat | Web UI | Main session visible in sidebar |
| 3 | Send "What is on my calendar tomorrow?" | Web UI | Agent returns calendar brief for tomorrow |
| 4 | Click **Daily plan** in the top bar | Web UI | Pre-built context (events + reminders + memory) is sent to the `daily-plan` skill |
| 5 | Type `/find Q3 launch` | Web UI | Searches prior messages and memory |
| 6 | Open Settings → AGENTS.md | Web UI | Edit and commit personal instructions to workspace git |
| 7 | Open Skills → Create skill `my-private` | Web UI | Stored in `~/.opencode/skills/my-private/SKILL.md` |
| 8 | In Telegram: `/login <code>` | Telegram | Account linked (code from Web UI Settings) |
| 9 | In Telegram: `/daily` | Telegram | Returns a structured daily plan |
| 10 | In Telegram: `/remind tomorrow 10:00 review Q3 deck` | Telegram | Real reminder row created |
| 11 | In Telegram: send a voice message | Telegram | STT → transcript → agent answer → quota charged |
| 12 | In Telegram: `/find Q3` | Telegram | Same FTS5 search as Web |
| 13 | In Telegram: `/meeting <paste notes>` | Telegram | Extracts decisions / action items / risks |
| 14 | In Telegram: `/calendar` | Telegram | Lists today's events |
| 15 | Admin: open `/admin` (with admin account) | Web UI | Block demo user |
| 16 | Demo user tries any endpoint | Web UI / Telegram | Returns 401/403 — blocked |

### Manager demo skills

Central skills available to every user:

- `daily-plan` — structured daily plan from calendar, reminders, memory
- `meeting-brief` — extract decisions, owners, risks, follow-ups
- `find-context` — search prior messages and memory
- `voice-action-summary` — extract actions from a transcript
- `executive-summary` — summarise long text
- `decision-log` — log and structure a decision
- `risk-analysis` — analyse risks
- `reminder-capture` — extract reminders from text
- `calendar-planning` — plan around calendar
- `email-draft` — draft a professional email
- `task-decomposition` — break a complex task down
- `web-research` — structured research workflow

### Manager demo Telegram commands

```text
/start       — welcome and instructions
/login <code>— link Telegram to account
/sessions    — list active sessions
/new <title> — create a new OpenCode session
/use <n>     — switch main session by number
/main        — show main session
/limits      — show quota balance
/remind ...  — create a reminder
/calendar    — list today's events
/daily       — daily plan from context
/find <q>    — search prior context
/meeting ... — extract brief from notes
/voice <tx>  — extract actions from transcript
/files [...] — list files
/sendfile    — get a file
/settings    — show settings
/help        — show commands
```

### Smoke test

```bash
# 30-step smoke test against a running backend
./smoke-test.sh http://127.0.0.1:3000
```

Pass criteria: 30 passed, 0 failed.

### Tests

```bash
npm test
```

99 unit tests cover OpenCode client mapping, workspace isolation, quota refill, admin allowlist, marketplace scanner, reminder parser, manager context builders, account deletion cascade, message context enrichment, permission gate decision logic, and skill slug validation.

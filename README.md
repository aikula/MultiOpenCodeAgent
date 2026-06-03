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

1. [`docs/DEVELOPMENT_SPEC.md`](docs/DEVELOPMENT_SPEC.md) — main development specification for the coding agent.
2. [`docs/SKILLS_AGENTS_AND_MARKETPLACE.md`](docs/SKILLS_AGENTS_AND_MARKETPLACE.md) — mandatory rules for OpenCode default agents, default skills, custom skills and skill-market import.
3. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — implementation phases, checklists and acceptance criteria.
4. [`docs/CODE_AGENT_INSTRUCTIONS.md`](docs/CODE_AGENT_INSTRUCTIONS.md) — direct instructions for the coding agent.

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

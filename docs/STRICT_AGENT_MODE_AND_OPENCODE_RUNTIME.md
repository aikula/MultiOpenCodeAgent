# Strict Agent Mode and OpenCode Runtime

MultiOpenCodeAgent must use OpenCode Server as the primary runtime and must work in strict agent mode.

Strict agent mode means:

- natural language text and voice are the main interface;
- slash commands are only shortcuts;
- the system performs supported actions instead of telling the user to open another page;
- reminders, calendar events, search, briefs and decisions must be executed from ordinary user messages;
- every action must be written both to the database and to the active session history.

## Runtime decision

Use `opencode serve` as the main runtime. The CLI is allowed only for local diagnostics, one-time setup and admin maintenance.

The backend is the only component allowed to call OpenCode. Frontend and Telegram must call the backend only.

## OpenCode skills

OpenCode skills must be installed as filesystem skills, not faked through the commands API.

Central skills path inside OpenCode container:

```text
/root/.config/opencode/skills/<skill-name>/SKILL.md
```

User skills path:

```text
/workspaces/u_<uuid>/.opencode/skills/<skill-name>/SKILL.md
```

Do not use `/command` as a skills endpoint. `/command` is for commands.

## Required central skills

Install these central skills:

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

## Central MCP

Only central MCP is allowed in v1. Users and imported skills must not add MCP servers.

Install these central MCP servers in global OpenCode config:

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    },
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app"
    }
  }
}
```

`context7` is for current documentation lookup. `gh_grep` is for public GitHub code search.

## Required code fixes

- Add `apps/backend/src/services/action-router.ts`.
- Route normal Web chat messages through the action router.
- Route Telegram text and STT transcripts through the action router.
- Remove `agent: "daily-plan"` and `agent: "find-context"` unless these agents are actually defined in OpenCode.
- Add central `manager` agent to OpenCode config.
- Install central skills into OpenCode global skills path.
- Add admin MCP status using OpenCode `GET /mcp`.

## Demo acceptance

This sentence must work in both Web and Telegram:

```text
Напомни завтра в 10 написать Ивану по договору и подготовь план встречи
```

Expected behavior:

1. Reminder is created.
2. Meeting plan is generated.
3. Result is saved in main session.
4. User receives a short confirmation.

The response must not say: "use /remind" or "open the Calendar page".

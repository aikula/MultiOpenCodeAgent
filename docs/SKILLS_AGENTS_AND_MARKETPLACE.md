# OpenCode agents, skills and skill marketplace specification

## 1. Core rule

Use OpenCode defaults first.

The platform must not replace OpenCode's default agents, default skills, built-in commands or normal discovery behavior. It must wrap and extend them.

This matters because OpenCode already has its own concepts of:

- agents;
- subagents;
- skills;
- commands;
- permissions;
- MCP servers;
- project-local configuration;
- global configuration.

The platform must not create a parallel fantasy-land taxonomy unless absolutely needed. Developers love doing this, apparently because maintaining one abstraction layer is not enough pain.

## 2. Skill resolution order

For every user workspace, skills must be resolved in this order:

```text
1. OpenCode built-in/default skills
2. OpenCode global central skills managed by admin
3. Project-local user skills in workspace/.opencode/skills/
4. Imported marketplace skills copied into workspace/.opencode/skills/marketplace/<slug>/
```

The platform must preserve OpenCode discovery behavior. If OpenCode already resolves skills internally, do not duplicate resolution logic for execution. The platform may index skills only for UI, validation, auditing and installation.

## 3. Agents

### 3.1. Default agent behavior

Database field:

```sql
default_agent TEXT DEFAULT NULL
```

Rules:

```text
[ ] If default_agent is NULL, do not send an explicit agent override to OpenCode.
[ ] This lets OpenCode use its own default agent.
[ ] Users may select another agent from the list returned by OpenCode.
[ ] Admin may create recommended presets, but they must not hide OpenCode defaults.
```

### 3.2. Agent list endpoint

Backend:

```http
GET /api/opencode/agents
```

Returns:

```json
{
  "defaultMode": "opencode-default",
  "agents": [
    {
      "id": "opencode-default",
      "title": "OpenCode default",
      "source": "opencode-default",
      "selected": true
    }
  ]
}
```

Also include all agents returned by OpenCode.

### 3.3. Recommended manager presets

The platform may provide recommended profiles:

```text
manager
research
planner
summarizer
build-lite
```

But these are recommendations, not replacements for OpenCode defaults.

## 4. Central skills

Central skills are managed by admin and installed into OpenCode global skills directory or another configured central path supported by OpenCode.

Recommended central skills for demo:

```text
executive-summary
meeting-brief
decision-log
daily-plan
risk-analysis
email-draft
calendar-planning
reminder-capture
web-research
task-decomposition
```

Each central skill must have:

```text
SKILL.md
metadata.json optional
version optional
source optional
```

Example:

```markdown
---
name: meeting-brief
description: Prepare a concise management brief from a meeting transcript, notes or chat.
---

# Meeting Brief

Use this skill when the user provides meeting notes, transcript or discussion context.

Return:
1. Short summary
2. Key decisions
3. Owners
4. Risks
5. Follow-up actions
6. Suggested reminders
```

## 5. User skills

User skills live in:

```text
/data/workspaces/u_<uuid>/.opencode/skills/<slug>/SKILL.md
```

Rules:

```text
[ ] User skills are private to the user workspace.
[ ] Skill slug must match: ^[a-z0-9][a-z0-9-]{1,60}$
[ ] Skill must contain SKILL.md.
[ ] Skill size must be limited.
[ ] Skill cannot write outside workspace.
[ ] Skill cannot define MCP servers.
[ ] Skill cannot change global OpenCode config.
```

Backend endpoints:

```http
GET    /api/skills
POST   /api/skills
GET    /api/skills/:id
PUT    /api/skills/:id
DELETE /api/skills/:id
```

User UI must show:

```text
- OpenCode default/built-in skills, read-only
- central skills, read-only
- user skills, editable
- imported marketplace skills, editable only if copied into user workspace
```

## 6. Skill marketplace import

### 6.1. Goal

Allow users or admins to import useful skills from a popular skill catalog or marketplace, without turning the system into an unattended supply-chain accident.

The platform must support a curated marketplace import flow.

### 6.2. Supported source types

For v1 support:

```text
[ ] Git repository URL from an allowlist.
[ ] Local catalog JSON maintained by admin.
[ ] Zip archive uploaded by admin.
```

Do not support arbitrary user-provided install scripts in v1.

### 6.3. Catalog schema

```json
{
  "name": "example-skill-catalog",
  "version": "1.0.0",
  "source_url": "https://example.com/catalog.json",
  "skills": [
    {
      "id": "meeting-brief-pro",
      "name": "meeting-brief-pro",
      "description": "Prepare management meeting briefs",
      "version": "1.0.0",
      "author": "catalog-author",
      "license": "MIT",
      "homepage": "https://example.com/meeting-brief-pro",
      "source_url": "https://example.com/skills/meeting-brief-pro",
      "sha256": "...",
      "tags": ["management", "meetings"],
      "permissions": {
        "requires_mcp": false,
        "requires_network": false,
        "requires_file_write": false
      }
    }
  ]
}
```

### 6.4. Import flow

```text
1. Admin adds catalog source.
2. Platform downloads or reads catalog metadata.
3. Platform scans skill package.
4. Platform marks skill as approved, rejected or needs_review.
5. User can install only approved skills.
6. Installing copies SKILL.md into workspace/.opencode/skills/marketplace/<slug>/.
7. The platform records source, version, checksum and install time.
```

### 6.5. Marketplace DB tables

```sql
CREATE TABLE skill_catalogs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN ('git', 'json', 'zip')),
  source_url TEXT,
  status TEXT CHECK(status IN ('active', 'disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL
);
```

```sql
CREATE TABLE marketplace_skills (
  id TEXT PRIMARY KEY,
  catalog_id TEXT REFERENCES skill_catalogs(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  author TEXT,
  license TEXT,
  source_url TEXT,
  sha256 TEXT,
  status TEXT CHECK(status IN ('approved', 'rejected', 'needs_review')) DEFAULT 'needs_review',
  scan_report_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
CREATE TABLE user_installed_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  marketplace_skill_id TEXT REFERENCES marketplace_skills(id),
  installed_slug TEXT NOT NULL,
  installed_path TEXT NOT NULL,
  version TEXT,
  sha256 TEXT,
  installed_at TEXT NOT NULL,
  enabled INTEGER DEFAULT 1
);
```

## 7. Skill scanner

Implement a conservative scanner.

Scan inputs:

```text
- SKILL.md content
- metadata.json
- filenames in package
- optional examples
```

Reject or require review if content contains:

```text
- instructions to disable permissions;
- instructions to modify ~/.config/opencode directly;
- instructions to edit AGENTS.md without explicit user request;
- references to .env, secrets, tokens, private keys;
- shell commands such as curl | sh, wget | sh, rm -rf, chmod +x;
- attempts to configure MCP servers;
- path traversal patterns;
- binary files;
- files outside expected skill directory;
- very large files;
- hidden files except allowed metadata.
```

A scanner result:

```json
{
  "status": "needs_review",
  "score": 42,
  "findings": [
    {
      "severity": "high",
      "code": "references_secrets",
      "message": "Skill text references private keys or secrets."
    }
  ]
}
```

## 8. Skill installation

Install approved skill:

```text
workspace/.opencode/skills/marketplace/<slug>/SKILL.md
workspace/.opencode/skills/marketplace/<slug>/metadata.json
```

Rules:

```text
[ ] Never execute install scripts.
[ ] Never copy arbitrary nested files unless allowlisted.
[ ] Preserve source metadata.
[ ] Record checksum.
[ ] Commit installation to workspace git.
```

## 9. Skill update

For v1:

```text
[ ] No automatic updates.
[ ] Admin can rescan catalog.
[ ] User sees update available.
[ ] User/admin chooses to update.
[ ] Update repeats scanner and approval flow.
```

No silent updates. Supply chains are already enough of a circus.

## 10. MCP policy

Only centralized MCP servers are allowed in v1.

Rules:

```text
[ ] Users cannot add MCP servers.
[ ] Marketplace skills cannot add MCP servers.
[ ] User skills cannot add MCP servers.
[ ] Admin manages central MCP config.
[ ] UI may show available MCP capabilities as read-only.
```

Recommended central MCP/tool capabilities for manager demo:

```text
search_user_context
create_reminder
list_reminders
create_calendar_event
list_calendar_events
calendar_brief
web_search if OpenCode/provider supports it safely
```

## 11. UI requirements

### Skills page

Sections:

```text
1. OpenCode built-in/default skills
2. Central skills
3. My skills
4. Skill catalog
5. Installed marketplace skills
```

Each skill card:

```text
- name
- description
- source
- version
- status
- enabled/disabled
- install/update/remove action where allowed
```

### Admin catalog page

Functions:

```text
[ ] Add catalog source.
[ ] Rescan catalog.
[ ] View scanner report.
[ ] Approve skill.
[ ] Reject skill.
[ ] Disable catalog.
```

## 12. Acceptance criteria

```text
[ ] OpenCode default agents are visible.
[ ] User can keep OpenCode default agent selected.
[ ] User can select another OpenCode agent.
[ ] OpenCode default skills are visible or at least not hidden.
[ ] Central skills are available to all users.
[ ] User skills are private.
[ ] Marketplace catalog can be imported by admin.
[ ] Unsafe marketplace skill is rejected or marked needs_review.
[ ] Approved marketplace skill can be installed by user.
[ ] Installed marketplace skill is copied into user's workspace.
[ ] Installed marketplace skill is not available to another user unless installed there too.
[ ] Marketplace skill cannot configure MCP.
[ ] Marketplace skill cannot change AGENTS.md automatically.
[ ] No install script is executed.
```

## 13. Tests

Add tests:

```text
[ ] default_agent NULL does not send agent override to OpenCode.
[ ] list agents includes OpenCode default option.
[ ] user skill path cannot escape workspace.
[ ] marketplace skill with path traversal is rejected.
[ ] marketplace skill with MCP config is rejected.
[ ] marketplace skill with shell installer is rejected.
[ ] installing approved skill writes only allowed files.
[ ] installed skill is committed to workspace git.
[ ] User A cannot see User B installed skills.
```

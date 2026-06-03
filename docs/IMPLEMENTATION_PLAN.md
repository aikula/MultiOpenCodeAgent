# Implementation plan, checklists and acceptance criteria

## Stage 0. Repository bootstrap

Tasks:

```text
[ ] Create monorepo structure.
[ ] Add backend package.
[ ] Add frontend package.
[ ] Add docs package or docs directory.
[ ] Add `.env.example`.
[ ] Add local development `docker-compose.yml` or `justfile`.
[ ] Add README with run instructions.
```

Acceptance:

```text
[ ] Developer can run backend locally.
[ ] Developer can run frontend locally.
[ ] OpenCode server URL is configured through env.
[ ] SQLite database path is configured through env.
```

## Stage 1. OpenCode bridge

Tasks:

```text
[ ] Implement OpenCodeClient.
[ ] Add health check.
[ ] Add listAgents.
[ ] Add listSkills.
[ ] Add listCommands.
[ ] Add createSession.
[ ] Add sendMessage.
[ ] Add forkSession.
[ ] Add summarizeSession.
[ ] Add mandatory workspacePath parameter to all session/message methods.
```

Checks:

```text
[ ] OpenCode health endpoint works.
[ ] Backend fails clearly when OpenCode is unavailable.
[ ] OpenCode credentials are not logged.
[ ] OpenCode is never exposed to frontend.
```

Acceptance:

```text
Backend can create an OpenCode session and send a message through internal OpenCode server.
```

## Stage 2. Auth, users and workspaces

Tasks:

```text
[ ] Implement registration.
[ ] Implement login.
[ ] Implement JWT auth.
[ ] Create user workspace on registration.
[ ] Initialize workspace as git repo.
[ ] Create AGENTS.md from template.
[ ] Create memory/profile.md, memory/facts.md, memory/preferences.md.
[ ] Create default main session.
[ ] Add welcome quota grant.
```

Checks:

```text
[ ] Workspace path is generated from UUID.
[ ] Workspace path is never accepted from request body.
[ ] Workspace exists after registration.
[ ] Main session exists after registration.
[ ] AGENTS.md exists after registration.
```

Acceptance:

```text
New user can register, log in and see an empty main session.
```

## Stage 3. Web chat and sessions

Tasks:

```text
[ ] Implement sessions API.
[ ] Implement messages API.
[ ] Implement message mirror table.
[ ] Implement web chat UI.
[ ] Implement session list UI.
[ ] Implement create session.
[ ] Implement switch main session.
[ ] Implement fork session.
[ ] Implement basic streaming or async status.
```

Checks:

```text
[ ] User sees only own sessions.
[ ] User cannot open another user's session by ID.
[ ] Message is sent to the correct workspace.
[ ] Message appears in history.
```

Acceptance:

```text
User can chat in Web UI, create another session and return to the main session.
```

## Stage 4. Telegram text bot

Tasks:

```text
[ ] Add Telegraf bot.
[ ] Implement /start.
[ ] Implement linking by code.
[ ] Implement admin manual Telegram ID link.
[ ] Implement Telegram to main session routing.
[ ] Implement /sessions.
[ ] Implement /new.
[ ] Implement /use.
[ ] Implement /main.
[ ] Implement /limits.
```

Checks:

```text
[ ] Unlinked Telegram user cannot chat.
[ ] Linked Telegram user can chat.
[ ] Telegram message appears in Web UI history.
[ ] /sessions shows only own sessions.
```

Acceptance:

```text
User sends message in Telegram, receives answer and sees the same message in Web UI.
```

## Stage 5. Quotas

Tasks:

```text
[ ] Implement quota_ledger.
[ ] Add welcome grant.
[ ] Charge text messages.
[ ] Charge voice/STT messages.
[ ] Add daily refill job.
[ ] Add admin quota grant.
[ ] Add /limits in Telegram.
[ ] Add limits UI.
```

Checks:

```text
[ ] Balance is sum of ledger deltas.
[ ] Message is rejected when balance <= 0.
[ ] Daily refill does not exceed daily quota limit.
[ ] Admin grant is auditable.
```

Acceptance:

```text
User spends quota, reaches zero and cannot send new tasks until refill or admin grant.
```

## Stage 6. OpenCode agents, skills and AGENTS.md

Tasks:

```text
[ ] Add OpenCode agents list endpoint.
[ ] Show OpenCode default agent option.
[ ] Let default_agent = NULL mean OpenCode default.
[ ] Add AGENTS.md editor.
[ ] Add reset AGENTS.md to template.
[ ] Add user skills CRUD.
[ ] Save user skills to workspace/.opencode/skills/<slug>/SKILL.md.
[ ] Show central skills read-only.
[ ] Show OpenCode default skills when available.
```

Checks:

```text
[ ] OpenCode default agent is not hidden.
[ ] No explicit agent override is sent when default_agent is NULL.
[ ] User skill path cannot escape workspace.
[ ] User A cannot see User B skills.
[ ] AGENTS.md changes are committed to workspace git.
```

Acceptance:

```text
User can keep OpenCode default agent, edit AGENTS.md, create a private skill and use it in chat.
```

## Stage 7. Skill catalog and marketplace import

Tasks:

```text
[ ] Add skill_catalogs table.
[ ] Add marketplace_skills table.
[ ] Add user_installed_skills table.
[ ] Implement catalog import from allowlisted source.
[ ] Implement skill scanner.
[ ] Implement admin approve/reject flow.
[ ] Implement user install approved marketplace skill.
[ ] Copy installed skill to workspace/.opencode/skills/marketplace/<slug>/.
[ ] Record checksum and version.
[ ] Commit installation to workspace git.
```

Checks:

```text
[ ] Unsafe skill is rejected or needs_review.
[ ] Skill with MCP config is rejected.
[ ] Skill with install script is rejected.
[ ] No script is executed during import or install.
[ ] Installed skill is private to user workspace.
```

Acceptance:

```text
Admin imports catalog, approves a skill, user installs it, and the agent can use it from the user's workspace.
```

## Stage 8. Telegram voice and STT

Tasks:

```text
[ ] Download Telegram voice file.
[ ] Save file to workspace/uploads/.
[ ] Implement STTProvider interface.
[ ] Send audio to configured STT server.
[ ] Save transcript.
[ ] Send transcript to main session.
[ ] Return agent answer to Telegram.
```

Checks:

```text
[ ] Audio file is saved in current user's workspace only.
[ ] STT errors are handled without crashing bot.
[ ] Transcript appears in history.
[ ] Quota is charged.
```

Acceptance:

```text
User sends voice message in Telegram and receives an agent answer based on transcript.
```

## Stage 9. Reminders

Tasks:

```text
[ ] Implement reminders CRUD.
[ ] Implement natural language extraction for reminder creation.
[ ] Implement /remind command in Telegram.
[ ] Implement reminders page.
[ ] Implement scheduler that checks due reminders every minute.
[ ] Send Telegram notification.
[ ] Mark reminders as sent.
```

Checks:

```text
[ ] Reminder fires once.
[ ] Cancelled reminder does not fire.
[ ] User A cannot see User B reminders.
[ ] Timezone is handled explicitly.
```

Acceptance:

```text
User says "remind me tomorrow at 10" and receives notification at the correct time.
```

## Stage 10. Calendar v1

Tasks:

```text
[ ] Implement local calendar provider.
[ ] Add calendar_events table.
[ ] Implement events CRUD.
[ ] Add calendar page.
[ ] Add /calendar-brief command.
[ ] Add conflict detection.
[ ] Allow creating event from chat.
```

Checks:

```text
[ ] Calendar events are user-isolated.
[ ] Agent can list tomorrow events.
[ ] Calendar brief includes preparation tasks.
[ ] Conflict detection works for overlapping events.
```

Acceptance:

```text
User asks "what is on my calendar tomorrow" and receives a useful management brief.
```

## Stage 11. Search and memory

Tasks:

```text
[ ] Add messages FTS.
[ ] Add memory FTS.
[ ] Implement /api/search.
[ ] Add search page.
[ ] Add search_user_context internal function/tool.
[ ] Add save memory item action.
```

Checks:

```text
[ ] Search returns only current user's data.
[ ] Search finds old Telegram messages.
[ ] Search finds old Web messages.
[ ] Agent can answer questions about previous decisions.
```

Acceptance:

```text
User asks "what did we decide about project X" and agent finds prior context.
```

## Stage 12. Admin panel

Tasks:

```text
[ ] Users list.
[ ] Create user.
[ ] Block/unblock user.
[ ] Edit quota limit.
[ ] Grant quota.
[ ] Manual Telegram ID link.
[ ] Central skills list.
[ ] Skill catalog management.
[ ] Audit log.
```

Checks:

```text
[ ] Blocked user cannot use Web.
[ ] Blocked user cannot use Telegram.
[ ] Admin actions are recorded in audit log.
```

Acceptance:

```text
Admin can manage users, quotas, Telegram links and skill catalog approval.
```

## Stage 13. Demo pack

Tasks:

```text
[ ] Add central skills:
    - executive-summary
    - daily-plan
    - meeting-brief
    - decision-log
    - risk-review
    - calendar-planning
    - reminder-capture
    - email-draft

[ ] Add central commands:
    - /daily-plan
    - /meeting-brief
    - /find-context
    - /remind
    - /calendar-brief
    - /email-draft
    - /decision-log
    - /risk-review

[ ] Add demo seed user.
[ ] Add demo sessions.
[ ] Add demo reminders.
[ ] Add demo calendar events.
```

Acceptance:

```text
Demo user can run the complete manager scenario from Telegram and Web UI.
```

## Smoke test script

Create a smoke test script that executes:

```text
1. Register user.
2. Login.
3. Send Web message.
4. Create new session.
5. Set session as main.
6. Send Telegram text message.
7. Send Telegram voice message with mocked STT.
8. Create reminder.
9. Trigger reminder scheduler.
10. Create calendar event.
11. Ask calendar brief.
12. Create user skill.
13. Install approved marketplace skill.
14. Search old message.
15. Block user.
16. Verify Web and Telegram are blocked.
```

## Release gate

Do not call v1 ready unless all are true:

```text
[ ] User isolation tests pass.
[ ] Quota tests pass.
[ ] OpenCode bridge tests pass.
[ ] Telegram text works.
[ ] Web chat works.
[ ] AGENTS.md editor works.
[ ] Default OpenCode agents are visible.
[ ] Default OpenCode skills are not hidden.
[ ] Marketplace unsafe skill is rejected.
[ ] Reminders work.
[ ] Calendar brief works.
[ ] Search works.
[ ] Smoke test passes.
```

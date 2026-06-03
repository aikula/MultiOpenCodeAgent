# Review fix specification for MultiOpenCodeAgent

Date: 2026-06-03
Target branch: `main`

This document converts the project review into implementation instructions for the coding agent.

The goal is not to add new features. The goal is to make the current implementation actually match the original specifications and survive the first serious demo without collapsing into local fallback theater.

## 1. Current review verdict

The repository has a broad MVP skeleton:

- backend and frontend monorepo;
- SQLite schema;
- users, auth, workspaces, sessions;
- Telegram bot;
- reminders, calendar, search;
- user skills and marketplace tables;
- OpenCode client abstraction;
- basic admin routes.

But the implementation is not ready for a real demo yet.

Main status:

```text
Architecture skeleton: good enough
Feature breadth: good
Spec compliance: partial
Demo readiness: blocked by P0 issues
Security/isolation confidence: insufficient until tests are added
```

Do not implement more features until P0 is complete.

## 2. P0 blockers

These must be fixed before any demo.

```text
[ ] Fix OpenCode API endpoint mapping and message body format.
[ ] Remove or strictly gate local-* OpenCode session fallback.
[ ] Fix TypeScript build issue in scanner.ts.
[ ] Apply quota check and charge to Web chat.
[ ] Fix daily quota refill logic to refill up to limit, not add limit every day.
[ ] Make Telegram /new create a real OpenCode session.
[ ] Make Telegram /remind create a real reminder record.
[ ] Fix marketplace skill install to install the real scanned SKILL.md content.
[ ] Replace admin mass-assignment update with allowlisted schema.
[ ] Update auth middleware to check user status and role from DB.
[ ] Restrict CORS in production.
[ ] Add smoke tests for the manager demo flow.
```

## 3. P1 required hardening

These should be done immediately after P0.

```text
[ ] Add audit_log table and audit service.
[ ] Add FTS synchronization for messages.
[ ] Commit AGENTS.md updates to user workspace git repo.
[ ] Validate skill slug in all skill endpoints.
[ ] Add max size limits for AGENTS.md, SKILL.md, marketplace skill content and messages.
[ ] Add OpenCode health gate for demo readiness.
[ ] Add frontend pages or navigation for search and memory.
[ ] Improve frontend API error handling.
```

## 4. P2 demo polish

Do after P0/P1 only.

```text
[ ] Make /daily-plan use calendar, reminders and memory.
[ ] Make /find-context use search_user_context.
[ ] Make /meeting-brief extract decisions, owners, risks and follow-ups.
[ ] Add voice demo flow: Telegram voice -> transcript -> reminder/calendar/action summary.
[ ] Add demo seed user and demo data.
[ ] Add guided demo scenario to README.
```

---

# 5. Detailed instructions for the coding agent

## 5.1. Fix OpenCode API integration

### Problem

`apps/backend/src/opencode/client.ts` currently uses plural endpoint names:

```text
/health
/agents
/skills
/commands
/sessions
/sessions/:id/messages
```

OpenCode server API uses singular server routes such as:

```text
/global/health
/agent
/command
/session
/session/:id/message
/session/:id/fork
/session/:id/summarize
```

The exact schema must be verified against the running OpenCode server OpenAPI endpoint before implementation is considered complete.

### Required changes

Update `OpenCodeClient`:

```text
[ ] health() calls GET /global/health.
[ ] listAgents() calls GET /agent.
[ ] listCommands() calls GET /command.
[ ] createSession() calls POST /session.
[ ] sendMessage() calls POST /session/:id/message.
[ ] forkSession() calls POST /session/:id/fork.
[ ] summarizeSession() calls POST /session/:id/summarize.
[ ] Do not call non-existing plural endpoints.
```

### Message body

`sendMessage()` must send OpenCode-compatible body.

Expected shape:

```ts
{
  model?: string
  agent?: string
  parts: [
    { type: 'text', text: input.text }
  ]
}
```

Rules:

```text
[ ] If agent is null or undefined, omit agent from body.
[ ] If model is null or undefined, omit model from body.
[ ] Do not send agent='opencode-default'. That is UI-only marker.
[ ] workspacePath must still be required by OpenCodeClient method signatures.
[ ] If OpenCode requires project/workspace context in another way, implement it explicitly and document it in code comments.
```

### Acceptance criteria

```text
[ ] Backend /api/opencode/health returns healthy when OpenCode is running.
[ ] Creating a Web session creates a real OpenCode session id, not local-*.
[ ] Sending a Web message returns a real assistant response from OpenCode.
[ ] Telegram messages use the same OpenCode session id.
[ ] All OpenCodeClient methods have unit tests with mocked fetch URLs.
[ ] Tests verify no plural legacy endpoint is called.
```

---

## 5.2. Remove unsafe local-* OpenCode fallback

### Problem

The current implementation silently creates `local-*` sessions when OpenCode is unavailable. This hides integration failures.

### Required changes

In these files:

```text
apps/backend/src/routes/auth.ts
apps/backend/src/routes/sessions.ts
apps/backend/src/telegram/bot.ts
```

Replace silent fallback with explicit behavior:

```text
[ ] In production/demo mode, fail session creation if OpenCode is unavailable.
[ ] In development only, allow local fallback behind env flag ALLOW_LOCAL_OPENCODE_FALLBACK=true.
[ ] Mark fallback sessions with status or metadata so UI can show they are not real OpenCode sessions.
[ ] Never send a message to OpenCode using local-* session id.
```

Add env variable:

```dotenv
ALLOW_LOCAL_OPENCODE_FALLBACK=false
```

### Acceptance criteria

```text
[ ] With OpenCode down and fallback disabled, registration returns clear error after user/workspace rollback or safe partial state.
[ ] With OpenCode down and fallback disabled, session creation fails with 503.
[ ] With fallback enabled in development, local session is visibly marked as local.
[ ] No production path silently creates local-* sessions.
```

---

## 5.3. Fix scanner.ts build issue

### Problem

`apps/backend/src/services/scanner.ts` imports types from itself and then redeclares them.

### Required changes

```text
[ ] Remove self-import from scanner.ts.
[ ] Keep local exported types.
[ ] Run TypeScript build.
```

### Acceptance criteria

```text
[ ] npm run build succeeds.
[ ] scanner.ts has no circular self-import.
[ ] scanSkillPackage unit tests pass.
```

---

## 5.4. Apply quota to Web chat

### Problem

Telegram checks quota, but Web chat currently does not charge quota.

### Required changes

In `apps/backend/src/routes/sessions.ts`:

```text
[ ] Before sending message, check balance.
[ ] Charge 1 unit for web_message.
[ ] If quota is insufficient, return HTTP 402 or 429 with clear error.
[ ] Do not insert assistant message if request is blocked by quota.
[ ] Decide and implement refund behavior if OpenCode fails after charge.
```

Recommended approach:

```text
1. Check balance.
2. Insert user message with status if status field is added, or insert only after quota charge.
3. Charge quota.
4. Call OpenCode.
5. If OpenCode fails, write assistant error and optionally refund with reason `refund_opencode_error`.
```

### Acceptance criteria

```text
[ ] Web message decreases quota by 1.
[ ] Zero quota blocks Web message.
[ ] Telegram message still decreases quota by 1.
[ ] /api/me/settings or dedicated /api/me/limits exposes current balance.
[ ] Tests cover Web quota and Telegram quota.
```

---

## 5.5. Fix daily quota refill

### Problem

Daily refill currently adds the full daily limit every day. It must refill up to the configured limit.

### Required changes

In `apps/backend/src/services/scheduler.ts`:

```text
[ ] Get current balance before refill.
[ ] Compute delta = max(0, dailyLimit - balance).
[ ] Insert daily_refill only if delta > 0.
[ ] Keep one refill ledger entry per user per day.
```

### Acceptance examples

```text
Given balance = 0 and limit = 20 -> add +20.
Given balance = 5 and limit = 20 -> add +15.
Given balance = 20 and limit = 20 -> add +0.
Given balance = 35 and limit = 20 -> add +0.
```

### Acceptance criteria

```text
[ ] Daily refill never raises balance above daily limit.
[ ] Daily refill does not create zero-delta noise records unless explicitly intended.
[ ] Unit tests cover all four examples above.
```

---

## 5.6. Fix Telegram session creation

### Problem

Telegram `/new` currently creates `local-*` sessions and bypasses OpenCode.

### Required changes

In `apps/backend/src/telegram/bot.ts`:

```text
[ ] /new must call opencodeClient.createSession({ workspacePath, title }).
[ ] Store returned OpenCode session id.
[ ] If OpenCode is unavailable, behave according to fallback policy.
[ ] New Telegram session must be usable from Web UI.
```

### Acceptance criteria

```text
[ ] /new creates real OpenCode session id.
[ ] /sessions shows the new session.
[ ] /use can set it as main.
[ ] Sending a message after /use uses the selected real OpenCode session.
```

---

## 5.7. Make Telegram /remind create reminders

### Problem

Telegram `/remind` currently replies that reminder was noted but does not create a reminder.

### Required changes

Implement minimal natural language reminder parser.

Supported v1 patterns:

```text
/remind 2026-06-04 10:00 write Ivan about contract
/remind tomorrow 10:00 write Ivan about contract
/remind today 18:30 check report
/remind in 30m call back
/remind in 2h prepare meeting plan
```

Use `DEFAULT_TIMEZONE` from env.

Behavior:

```text
[ ] If parse succeeds, insert reminders row.
[ ] Reply with title, date/time, timezone and channel.
[ ] If parse fails, show supported formats.
[ ] Do not call OpenCode for simple reminder parsing unless necessary.
```

### Acceptance criteria

```text
[ ] /remind tomorrow 10:00 test creates scheduled reminder.
[ ] /remind in 30m test creates scheduled reminder.
[ ] Created reminder appears in Web UI.
[ ] Scheduler sends Telegram message when due.
[ ] Invalid format produces helpful response.
```

---

## 5.8. Fix marketplace skill content handling

### Problem

Marketplace import scans provided content but does not store it. Install creates a fake SKILL.md from name and description.

### Required changes

Schema:

```text
[ ] Add content or content_sha/content_path to marketplace_skills.
[ ] Add sha256 storage and validation.
[ ] Store original scanned SKILL.md content.
```

Import flow:

```text
[ ] Validate slug.
[ ] Scan original SKILL.md.
[ ] Compute sha256.
[ ] Store original content and scan report.
[ ] Mark status according to scanner.
```

Install flow:

```text
[ ] Only approved skills can be installed.
[ ] Copy original scanned SKILL.md into workspace/.opencode/skills/marketplace/<slug>/SKILL.md.
[ ] Write metadata.json with source, version, author, sha256, installedAt.
[ ] Recompute sha256 before install and compare stored sha256.
[ ] Commit installation to user workspace git.
```

### Acceptance criteria

```text
[ ] Installed marketplace SKILL.md equals the approved scanned content.
[ ] Marketplace skill content is not regenerated from description.
[ ] Skill with invalid slug is rejected.
[ ] Skill with blocked scanner findings is rejected.
[ ] User A installed marketplace skill is not visible as installed for User B.
```

---

## 5.9. Replace admin mass assignment with allowlist schema

### Problem

Admin update route writes request body directly into users table.

### Required changes

In `apps/backend/src/routes/admin.ts`:

```text
[ ] Add Zod schema for admin user updates.
[ ] Allow only: displayName, role, status, dailyQuotaLimit, language, responseStyle.
[ ] Reject passwordHash, id, email, createdAt, updatedAt, welcomeQuotaGranted.
[ ] Return 400 for unknown fields if possible.
```

Suggested schema:

```ts
const adminUpdateUserSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'blocked', 'pending']).optional(),
  dailyQuotaLimit: z.number().int().min(0).max(10000).optional(),
  language: z.string().max(10).optional(),
  responseStyle: z.string().max(50).optional(),
}).strict()
```

### Acceptance criteria

```text
[ ] Admin can block and unblock user.
[ ] Admin can change daily quota limit.
[ ] Admin cannot update passwordHash through PATCH /api/admin/users/:id.
[ ] Admin cannot update id/email/createdAt through PATCH.
[ ] Tests cover allowed and rejected fields.
```

---

## 5.10. Make auth middleware DB-backed

### Problem

JWT contains role. Admin middleware trusts role from token. If user is blocked or role changes, old token remains valid until expiration.

### Required changes

In `apps/backend/src/middleware/auth.ts`:

```text
[ ] JWT should only be trusted for userId identity.
[ ] Load user from DB on each authenticated request.
[ ] Reject if user does not exist.
[ ] Reject if user.status !== active.
[ ] Set request.user.role from DB, not token.
```

Optionally reduce token TTL or add token version later.

### Acceptance criteria

```text
[ ] Blocked user cannot use Web API with old token.
[ ] User demoted from admin loses admin access immediately.
[ ] User promoted to admin gains admin access on next request.
[ ] Tests cover blocked user and role change.
```

---

## 5.11. Restrict CORS

### Problem

Backend currently uses broad CORS.

### Required changes

Add env:

```dotenv
CORS_ORIGINS=http://localhost:5173
```

Implementation:

```text
[ ] In development, allow configured local origins.
[ ] In production, require explicit CORS_ORIGINS.
[ ] Do not use origin:true in production.
```

### Acceptance criteria

```text
[ ] Production boot fails if CORS_ORIGINS is missing.
[ ] Allowed origin works.
[ ] Unknown origin is rejected.
```

---

# 6. P1 implementation details

## 6.1. Add audit_log

Schema:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
```

Audit service:

```ts
auditLog({ actorUserId, action, targetType, targetId, metadata })
```

Log at least:

```text
[ ] user_registered
[ ] login_success
[ ] login_failed
[ ] telegram_linked
[ ] admin_user_updated
[ ] quota_granted
[ ] marketplace_skill_imported
[ ] marketplace_skill_status_changed
[ ] marketplace_skill_installed
[ ] request_blocked_quota
[ ] blocked_user_request
[ ] workspace_access_denied
```

Acceptance:

```text
[ ] /api/admin/audit returns audit_log, not quota_ledger.
[ ] Every admin mutation creates audit record.
```

## 6.2. Fix FTS synchronization

Current messages_fts may not receive data.

Implement one of:

```text
Option A: SQLite triggers on messages insert/update/delete.
Option B: Manually insert into messages_fts whenever message is inserted.
```

Acceptance:

```text
[ ] Search finds newly inserted Web messages.
[ ] Search finds newly inserted Telegram messages.
[ ] Search returns only current user's messages.
```

## 6.3. Commit AGENTS.md updates

In settings route:

```text
[ ] Validate content max size.
[ ] Write AGENTS.md.
[ ] Commit file to workspace git.
[ ] Use fixed git commit author config.
```

Acceptance:

```text
[ ] Updating AGENTS.md creates git commit.
[ ] Empty or oversized AGENTS.md is rejected.
```

## 6.4. Validate skill operations consistently

In skill routes:

```text
[ ] Validate slug on GET, PUT, DELETE, not only POST.
[ ] Validate content size.
[ ] Validate SKILL.md has name and description frontmatter if required.
[ ] Use safe git commit helper instead of shell string concatenation.
```

Acceptance:

```text
[ ] Invalid slug rejected on every skill endpoint.
[ ] Oversized skill rejected.
[ ] User A cannot read User B skill.
```

---

# 7. Required test plan

Add a test framework. Prefer Vitest.

Root scripts:

```json
{
  "scripts": {
    "test": "npm run test -w @moca/backend",
    "build": "npm run build -w @moca/shared && npm run build -w @moca/backend && npm run build -w @moca/frontend"
  }
}
```

Backend tests:

```text
[ ] OpenCodeClient endpoint mapping.
[ ] OpenCodeClient omits agent/model when null.
[ ] Workspace path assertion blocks escape attempts.
[ ] Auth middleware rejects blocked user.
[ ] Admin PATCH rejects unknown fields.
[ ] Web message charges quota.
[ ] Zero quota blocks Web message.
[ ] Daily refill adds only missing balance.
[ ] Telegram /new creates real OpenCode session using mocked OpenCodeClient.
[ ] Reminder parser supports required patterns.
[ ] Marketplace scanner rejects blocked package patterns.
[ ] Marketplace install writes original SKILL.md.
[ ] Search returns only own user data.
```

Smoke tests:

```text
[ ] Register user.
[ ] Login.
[ ] Verify workspace exists and is git repo.
[ ] Verify AGENTS.md exists.
[ ] Verify main OpenCode session exists.
[ ] Send Web message.
[ ] Verify quota decreased.
[ ] Link Telegram.
[ ] Send Telegram message.
[ ] Create Telegram reminder.
[ ] Trigger scheduler.
[ ] Create calendar event.
[ ] Ask calendar brief.
[ ] Create user skill.
[ ] Import approved marketplace skill.
[ ] Install marketplace skill.
[ ] Search previous message.
[ ] Block user.
[ ] Verify old token no longer works.
```

---

# 8. Demo acceptance criteria

The project can be shown to managers only when this full scenario works:

```text
1. User registers in Web UI.
2. System creates workspace, AGENTS.md, memory files and main OpenCode session.
3. User sends Web message and gets real OpenCode response.
4. Quota decreases.
5. User links Telegram.
6. User sends Telegram text and sees same session in Web UI.
7. User creates reminder from Telegram.
8. Reminder appears in Web UI.
9. Reminder fires in Telegram.
10. User creates calendar event.
11. User requests calendar brief.
12. User creates private skill.
13. User installs approved marketplace skill.
14. User searches previous decision/context.
15. Admin blocks user.
16. User immediately loses Web and Telegram access.
```

No local-* hidden session fallback is allowed in this demo.

---

# 9. Definition of Done for this fix batch

```text
[ ] P0 checklist fully complete.
[ ] npm run build passes.
[ ] npm run test passes.
[ ] Smoke test passes or is documented with mocked external services.
[ ] README updated with corrected run/demo flow.
[ ] No silent OpenCode fallback in production/demo mode.
[ ] Web and Telegram both charge quota.
[ ] Marketplace installs real approved SKILL.md.
[ ] User isolation tests exist.
[ ] Review notes are resolved or explicitly moved to P1/P2.
```

## 10. Instruction to the coding agent

Implement fixes in this order:

```text
1. Make the project compile.
2. Fix OpenCodeClient endpoints and message body.
3. Remove silent local-* fallback.
4. Fix quota enforcement and refill.
5. Fix Telegram /new and /remind.
6. Fix marketplace content persistence and install.
7. Harden auth/admin/CORS/workspace path handling.
8. Add audit_log and FTS sync.
9. Add tests.
10. Update README with corrected demo flow.
```

Do not add unrelated features until all P0 items are complete.

If a fix requires changing the original specification, document the reason in `docs/IMPLEMENTATION_NOTES.md` instead of silently changing behavior. Silent behavior changes are how small prototypes grow into haunted houses with dashboards.

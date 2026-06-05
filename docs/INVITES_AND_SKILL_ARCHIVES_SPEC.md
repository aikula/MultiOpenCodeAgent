# Invite Codes and Skill Archive Upload Specification

## 1. Why this is needed

The platform is now public enough that open registration is a bad default. For a classroom demo, registrations must be controlled through invite codes.

Skills also need a practical installation path. Users and admins should be able to upload a ZIP archive with one or more OpenCode skills, validate it, and install it either globally or privately.

The goal is not to build a full marketplace. The goal is to stop pretending that copying random Markdown by hand is a deployment process. Civilization has suffered enough.

## 2. Registration with invite code

### 2.1. Required behavior

Registration must require an invite code.

Flow:

```text
1. User opens Register page.
2. User enters email, display name, password and invite code.
3. Backend validates the invite code.
4. If valid: create account, consume or decrement code, create workspace, grant quota, create main session.
5. If invalid/expired/overused: reject registration.
```

### 2.2. Invite code types

Support two types:

```text
single_use
multi_use
```

Recommended defaults:

```text
single_use: for individual students
multi_use: for one class or workshop group
```

### 2.3. Database table

Add table:

```sql
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  status TEXT CHECK(status IN ('active', 'disabled', 'expired')) DEFAULT 'active',
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add table:

```sql
CREATE TABLE IF NOT EXISTS invite_code_uses (
  id TEXT PRIMARY KEY,
  invite_code_id TEXT NOT NULL REFERENCES invite_codes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT,
  used_at TEXT NOT NULL
);
```

Do not store invite codes in plaintext. Store hash only.

### 2.4. Backend changes

Update validation:

```ts
registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100).optional(),
  inviteCode: z.string().min(4).max(100),
})
```

Add service:

```text
apps/backend/src/services/invites.ts
```

Functions:

```ts
createInviteCode(input): Promise<{ plainCode: string; id: string }>
validateInviteCode(plainCode: string): InviteCode
consumeInviteCode(inviteCodeId: string, userId: string, email: string): void
```

Consumption must happen in the same logical registration flow. If account creation fails, code usage must not be recorded.

### 2.5. Admin API

Add endpoints:

```http
GET  /api/admin/invites
POST /api/admin/invites
PATCH /api/admin/invites/:id
POST /api/admin/invites/:id/disable
```

Create invite body:

```json
{
  "label": "MBA group June 2026",
  "maxUses": 30,
  "expiresAt": "2026-06-30T23:59:59.000Z"
}
```

Return plaintext code only once:

```json
{
  "id": "...",
  "code": "MOCA-ABCD-EFGH",
  "label": "MBA group June 2026"
}
```

### 2.6. Frontend changes

Register page must add:

```text
Invite code input
```

Error messages:

```text
Invalid invite code.
Invite code expired.
Invite code usage limit reached.
```

Admin page must add invite management.

### 2.7. Acceptance criteria

```text
[ ] Registration without invite code is rejected.
[ ] Registration with invalid code is rejected.
[ ] Registration with expired code is rejected.
[ ] single_use code works once only.
[ ] multi_use code works until max_uses.
[ ] code is stored as hash, not plaintext.
[ ] admin can create invite code and copy plaintext once.
[ ] audit log records invite creation and usage.
```

## 3. Skill archive upload

## 3.1. Availability model

Support two installation scopes:

```text
global
user
```

Rules:

```text
[ ] Admin may upload global skills.
[ ] Admin may upload user-private skills for a selected user.
[ ] Regular user may upload only user-private skills into own workspace.
[ ] Global skills become available to all users.
[ ] User-private skills are available only in that user's workspace.
[ ] Imported archive must never be allowed to change MCP config.
```

Default behavior:

```text
Admin upload default: global
User upload default: user-private
```

This answers the practical question: **both are supported**, but global install is admin-only.

## 3.2. Archive format

Accept `.zip` only.

Supported layouts:

### Single skill archive

```text
SKILL.md
metadata.json optional
```

Install slug is inferred from `name:` in SKILL.md.

### Multi-skill archive

```text
skills/
  daily-plan/
    SKILL.md
  meeting-brief/
    SKILL.md
```

or:

```text
daily-plan/
  SKILL.md
meeting-brief/
  SKILL.md
```

Reject archives with:

```text
node_modules/
.git/
dist/
build/
large binary files
files outside expected skill folders
missing SKILL.md
invalid skill names
invalid frontmatter
```

## 3.3. Skill format validation

Add strict validator:

```text
apps/backend/src/services/skill-format.ts
```

Validation rules:

```text
[ ] Folder name matches skill name.
[ ] File name is exactly SKILL.md.
[ ] YAML frontmatter exists.
[ ] Frontmatter contains required `name`.
[ ] Frontmatter contains required `description`.
[ ] name matches ^[a-z0-9]+(-[a-z0-9]+)*$.
[ ] description is not empty.
[ ] description length <= 1024.
[ ] body is not empty.
[ ] file size <= configured limit.
```

Return structured result:

```ts
interface SkillFormatResult {
  valid: boolean
  name?: string
  description?: string
  errors: Array<{
    code: string
    message: string
    line?: number
  }>
  normalizedContent?: string
}
```

## 3.4. Text-to-skill formatting

If the user enters plain text instead of valid `SKILL.md`, the system should help format it.

UI behavior:

```text
1. User writes plain text skill instructions.
2. User clicks "Format as OpenCode Skill".
3. Backend returns a suggested SKILL.md with frontmatter.
4. User reviews and saves.
5. Validator runs again before save.
```

Add endpoint:

```http
POST /api/skills/format
```

Body:

```json
{
  "name": "meeting-followup",
  "description": "Prepare meeting follow-up actions",
  "plainText": "..."
}
```

Response:

```json
{
  "content": "---\nname: meeting-followup\ndescription: ...\n---\n\n# Meeting Followup\n...",
  "validation": { "valid": true, "errors": [] }
}
```

This can be deterministic for v1. No LLM required.

## 3.5. Archive upload endpoints

Add endpoints:

```http
POST /api/skills/upload-archive
POST /api/admin/skills/upload-archive
GET  /api/admin/skills/startup-check
```

User upload body:

```text
multipart/form-data
file: skills.zip
scope: user
```

Admin upload body:

```text
multipart/form-data
file: skills.zip
scope: global | user
targetUserId: optional when scope=user
```

## 3.6. Installation paths

Global install path in repository/runtime:

```text
apps/opencode/skills/<skill-name>/SKILL.md
```

Runtime inside OpenCode container:

```text
/root/.config/opencode/skills/<skill-name>/SKILL.md
```

User install path:

```text
/workspaces/u_<uuid>/.opencode/skills/<skill-name>/SKILL.md
```

Important:

```text
[ ] Global skills installed through UI must go to a runtime-writable global skills volume, not only to image build context.
[ ] Docker Compose should mount ./data/opencode-config/skills to /root/.config/opencode/skills.
[ ] Repository bundled skills can be copied into that volume on first boot.
```

## 3.7. Startup skill check

At backend startup and through admin endpoint, validate:

```text
[ ] global skills directory exists;
[ ] every global skill has valid SKILL.md;
[ ] bundled skills are present in runtime global directory;
[ ] user skills directories are valid for active users;
[ ] invalid skills are reported, not silently ignored.
```

Add service:

```text
apps/backend/src/services/skill-startup-check.ts
```

Return:

```ts
interface SkillStartupCheckResult {
  global: Array<{ name: string; valid: boolean; errors: string[] }>
  users: Array<{ userId: string; skills: Array<{ name: string; valid: boolean; errors: string[] }> }>
  ok: boolean
}
```

## 3.8. Admin UI

Admin Skills page should show:

```text
Global skills
User-private skills
Upload archive
Startup check status
Validation report
MCP status
```

## 3.9. Regular user UI

User Skills page should show:

```text
My skills
Create from text
Format as OpenCode Skill
Upload archive
Validation errors
Installed marketplace skills
Read-only central skills
```

## 3.10. Acceptance criteria

```text
[ ] Admin can upload ZIP with one global skill.
[ ] Admin can upload ZIP with multiple global skills.
[ ] Regular user can upload ZIP with user-private skill.
[ ] Regular user cannot install global skill.
[ ] Invalid SKILL.md is rejected with useful errors.
[ ] Plain text can be formatted into valid SKILL.md.
[ ] Startup check reports all global skills.
[ ] Startup check reports invalid user skills.
[ ] OpenCode container has runtime access to global skills directory.
[ ] User-private skill is visible only in that user's workspace.
```

## 4. Missed items found in current project

Current gaps to fix:

```text
[ ] Registration has no invite code field.
[ ] registerSchema has no inviteCode.
[ ] Login/Register UI has no invite code input.
[ ] Marketplace import accepts JSON skills, but not ZIP archive upload.
[ ] User skill CRUD validates slug and size, but not full OpenCode SKILL.md format.
[ ] OpenCode skill listing must not use /command as fake skills list.
[ ] Global skills are copied at image build, but runtime admin uploads need a mounted writable skills directory.
[ ] Docker Compose currently mounts ./data/opencode-config over /root/.config/opencode, which can hide image-copied skills unless seeded into that volume.
[ ] Strict agent mode still requires action-router implementation.
[ ] Web and Telegram normal messages must route through action-router.
[ ] Admin MCP status page is still missing.
[ ] Core Russian demo sentence needs an explicit end-to-end smoke test.
```

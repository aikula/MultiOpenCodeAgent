# Technical Debt

Tracked issues from code review (2026-06-06). Items here are real problems
that require more significant changes or architectural decisions.

## Security

### S1. Skill upload lacks full scanner

`routes/skill-upload.ts` — `findAndInstallSkills()` only validates SKILL.md
frontmatter. The spec requires `scanSkillPackage` that rejects binary files,
setup scripts, MCP config, plugin config, hidden files, credential-like
content, and instructions to disable permissions. None of these checks run on
user ZIP uploads.

**Fix:** Implement the full `scanSkillPackage` checklist from
`SKILLS_AGENTS_AND_MARKETPLACE.md` and wire it into both user and admin
upload paths.

### S2. `.env` contains live production secrets on disk

Telegram bot token, STT API keys, FireWorks API key, proxy password are in
the unencrypted `.env` file. While `.gitignore` prevents git exposure, the
file is readable by any process on the host. Consider Docker secrets or a
vault for production.

### S3. `auth.json` baked into Docker image

`apps/opencode/auth.json` contains the OpenCode API key and is `COPY`'d into
the image at build time. Should be injected at runtime via env or mounted
secret.

## Correctness

### C1. Invite code TOCTOU race

`services/invites.ts` — between `validateInviteCode` (checks `usedCount <
maxUses`) and `consumeInviteCode` (increments `usedCount`), concurrent
registrations can exceed `maxUses`. Needs a transaction or atomic update.

### C2. `opencode/client.ts` ignores `workspacePath` parameter

`listSkills()` and `listCommands()` accept `input?.workspacePath` but never
send it to the OpenCode API. If OpenCode requires workspace context for
correct results, these calls may return wrong data.

### C3. `uploadFiles` backend processes only one file

Frontend sends multiple files under `files` key, but
`routes/files.ts` uses `request.file()` which returns a single file. Remaining
files are silently dropped. Either limit frontend to single file or use
`request.files()` for array.

### C4. `schema.ts` `welcomeQuotaGranted` column is dead

Column exists with default 30 but is never read or updated. Code uses
`env.WELCOME_QUOTA` directly. Remove or document the disconnect.

### C5. `marketplaceSkills.slug` lacks unique constraint

Two marketplace skills can share a slug, causing confusion during installation
(same directory name in workspace).

### C6. `memoryItems.sourceSessionId` has no foreign key

Orphaned references accumulate when sessions are deleted.

## Frontend

### F1. Nginx has no security headers

`nginx.conf` is missing `Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`, `Strict-Transport-Security`. These should be added for
production.

### F2. Skill delete has no confirmation

Clicking "Delete" in Skills page immediately deletes without confirmation
dialog. Easy to destroy data with a misclick.

### F3. Chat auto-scroll on session switch

`useEffect` scrolls to bottom whenever `messages` changes, including when
switching sessions. User loses context at the top of a different conversation.

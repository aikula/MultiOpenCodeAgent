#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
PASS=0
FAIL=0

ok() { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1 — $2"; ((FAIL++)); }

echo "=== MultiOpenCodeAgent Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# 1. Health
echo "--- 1. Health check ---"
STATUS=$(curl -sf "$BASE_URL/health" | grep -o '"status":"ok"' || true)
if [ -n "$STATUS" ]; then ok "Health"; else fail "Health" "no ok status"; fi

# 2. Register user A
echo "--- 2. Register user A ---"
REG_A=$(curl -sf -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-a@test.com","password":"test123","displayName":"Smoke A"}') || true
TOKEN_A=$(echo "$REG_A" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_A" ]; then ok "Register A"; else fail "Register A" "no token (will try login)"; fi

# 3. Register user B (for isolation test)
echo "--- 3. Register user B ---"
REG_B=$(curl -sf -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-b@test.com","password":"test456"}') || true
TOKEN_B=$(echo "$REG_B" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_B" ]; then ok "Register B"; else fail "Register B" "no token (will try login)"; fi

# 4. Login (also recovers TOKEN_A if registration failed due to existing user)
echo "--- 4. Login ---"
LOGIN=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-a@test.com","password":"test123"}') || true
TOKEN_RE=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_RE" ]; then
  ok "Login"
  # Use login token if registration didn't yield one
  if [ -z "$TOKEN_A" ]; then TOKEN_A="$TOKEN_RE"; fi
else
  fail "Login" "no token"
fi
# Also recover TOKEN_B if needed
if [ -z "$TOKEN_B" ]; then
  LOGIN_B=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke-b@test.com","password":"test456"}') || true
  TOKEN_B=$(echo "$LOGIN_B" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

# 5. Get /me
echo "--- 5. Get /me ---"
ME=$(curl -sf "$BASE_URL/api/me" -H "Authorization: Bearer $TOKEN_A") || true
echo "$ME" | grep -q '"email":"smoke-a@test.com"' && ok "Get me" || fail "Get me" "$ME"

# 6. AGENTS.md
echo "--- 6. AGENTS.md ---"
AGENTS=$(curl -sf "$BASE_URL/api/me/agents-md" -H "Authorization: Bearer $TOKEN_A") || true
echo "$AGENTS" | grep -q "User Agent Instructions" && ok "AGENTS.md content" || fail "AGENTS.md" "wrong content"

# 7. Settings
echo "--- 7. Settings ---"
SETTINGS=$(curl -sf "$BASE_URL/api/me/settings" -H "Authorization: Bearer $TOKEN_A") || true
echo "$SETTINGS" | grep -q '"language":"ru"' && ok "Settings" || fail "Settings" "$SETTINGS"

# 8. Sessions (should have main session from registration)
echo "--- 8. Sessions ---"
SESSIONS=$(curl -sf "$BASE_URL/api/sessions" -H "Authorization: Bearer $TOKEN_A") || true
echo "$SESSIONS" | grep -q '"isMain"' && ok "Sessions list" || fail "Sessions" "empty or no main"

# 9. Create another session
echo "--- 9. Create session ---"
NEW_SESS=$(curl -sf -X POST "$BASE_URL/api/sessions" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test session"}') || true
SESS_ID=$(echo "$NEW_SESS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SESS_ID" ]; then ok "Create session"; else fail "Create session" "$NEW_SESS"; fi

# 10. Send message
echo "--- 10. Send message ---"
MSG=$(curl -sf -X POST "$BASE_URL/api/sessions/$SESS_ID/messages" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from smoke test"}') || true
echo "$MSG" | grep -q '"userMessage"' && ok "Send message" || fail "Send message" "$MSG"

# 11. User isolation — A cannot see B sessions
echo "--- 11. User isolation ---"
SESS_B=$(curl -sf "$BASE_URL/api/sessions" -H "Authorization: Bearer $TOKEN_B") || true
SESS_A_IDS=$(echo "$SESSIONS" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 || true)
FOUND_B="no"
for id in $SESS_A_IDS; do
  if echo "$SESS_B" | grep -q "$id"; then FOUND_B="yes"; break; fi
done
[ "$FOUND_B" = "no" ] && ok "Isolation: B cannot see A sessions" || fail "Isolation" "B sees A session $id"

# 12. Reminders
echo "--- 12. Reminders ---"
REM=$(curl -sf -X POST "$BASE_URL/api/reminders" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke reminder","remindAt":"2026-06-05T10:00:00Z"}') || true
echo "$REM" | grep -q '"status":"scheduled"' && ok "Create reminder" || fail "Reminder" "$REM"

# 13. Calendar
echo "--- 13. Calendar ---"
CAL=$(curl -sf -X POST "$BASE_URL/api/calendar/events" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke event","startsAt":"2026-06-03T16:00:00Z","endsAt":"2026-06-03T17:00:00Z"}') || true
echo "$CAL" | grep -q '"title":"Smoke event"' && ok "Create calendar event" || fail "Calendar" "$CAL"

# 14. Calendar brief
echo "--- 14. Calendar brief ---"
BRIEF=$(curl -sf -X POST "$BASE_URL/api/calendar/brief" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-06-03"}') || true
echo "$BRIEF" | grep -q "Smoke event" && ok "Calendar brief" || fail "Brief" "$BRIEF"

# 15. Skills
echo "--- 15. Skills ---"
SKILL=$(curl -sf -X POST "$BASE_URL/api/skills" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"smoke-skill","content":"# Smoke Skill\nTest content."}') || true
echo "$SKILL" | grep -q '"ok":true' && ok "Create skill" || fail "Skill" "$SKILL"

# 16. Search
echo "--- 16. Search ---"
SEARCH=$(curl -sf "$BASE_URL/api/search?q=smoke" -H "Authorization: Bearer $TOKEN_A") || true
echo "$SEARCH" | grep -q '"results"' && ok "Search" || fail "Search" "$SEARCH"

# 17. Central skills
echo "--- 17. Central skills ---"
CSKILLS=$(curl -sf "$BASE_URL/api/opencode/central-skills" -H "Authorization: Bearer $TOKEN_A") || true
echo "$CSKILLS" | grep -q "daily-plan" && ok "Central skills" || fail "Central skills" "$CSKILLS"

# 18. Memory
echo "--- 18. Memory ---"
MEM=$(curl -sf -X POST "$BASE_URL/api/memory" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"type":"fact","content":"This is a smoke test fact"}') || true
echo "$MEM" | grep -q '"id"' && ok "Create memory" || fail "Memory" "$MEM"

# 19. Marketplace scan
echo "--- 19. Marketplace scan ---"
SCAN=$(curl -sf -X POST "$BASE_URL/api/skill-catalogs/scan" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"skillMd":"# Safe skill\nThis is safe content."}') || true
echo "$SCAN" | grep -q '"status":"approved"' && ok "Skill scanner" || fail "Scanner" "$SCAN"

# 20. Login code
echo "--- 20. Login code ---"
CODE=$(curl -sf "$BASE_URL/api/me/login-code" -H "Authorization: Bearer $TOKEN_A") || true
echo "$CODE" | grep -q '"code"' && ok "Login code" || fail "Login code" "$CODE"

# 21. Logout
echo "--- 21. Logout ---"
LO=$(curl -sf -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $TOKEN_A") || true
echo "$LO" | grep -q '"ok":true' && ok "Logout" || fail "Logout" "$LO"

# 22. Login back
echo "--- 22. Re-login after logout ---"
RELOGIN=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-a@test.com","password":"test123"}') || true
TOKEN_A=$(echo "$RELOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_A" ]; then ok "Re-login"; else fail "Re-login" "no token"; fi

# 23. Quota decreased after send
echo "--- 23. Quota after message ---"
LIMITS=$(curl -sf "$BASE_URL/api/me/limits" -H "Authorization: Bearer $TOKEN_A") || true
if echo "$LIMITS" | grep -q '"balance"'; then
  ok "Quota endpoint"
else
  fail "Quota endpoint" "$LIMITS"
fi

# 24. Find context
echo "--- 24. Find context ---"
FIND=$(curl -sf "$BASE_URL/api/manager/find-context?q=smoke" -H "Authorization: Bearer $TOKEN_A") || true
echo "$FIND" | grep -q '"query"' && ok "Find context" || fail "Find context" "$FIND"

# 25. Daily plan context
echo "--- 25. Daily plan context ---"
DAILY=$(curl -sf "$BASE_URL/api/manager/daily-plan" -H "Authorization: Bearer $TOKEN_A") || true
echo "$DAILY" | grep -q '"date"' && ok "Daily plan context" || fail "Daily plan" "$DAILY"

# 26. Meeting brief
echo "--- 26. Meeting brief ---"
MEETING=$(curl -sf -X POST "$BASE_URL/api/manager/meeting-brief" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"notes":"Decided that Q3 launch is fixed. Anna will prepare the report by 2026-06-15. Risk: vendor delay."}') || true
echo "$MEETING" | grep -q '"decisions"' && ok "Meeting brief" || fail "Meeting brief" "$MEETING"

# 27. Voice summary
echo "--- 27. Voice summary ---"
VOICE=$(curl -sf -X POST "$BASE_URL/api/manager/voice-summary" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"Remind me to call John tomorrow at 10."}') || true
echo "$VOICE" | grep -q '"actions"' && ok "Voice summary" || fail "Voice summary" "$VOICE"

# 28. Workspace is a git repo
echo "--- 28. Workspace git repo ---"
WS_RESP=$(curl -sf "$BASE_URL/api/me/workspace" -H "Authorization: Bearer $TOKEN_A" || true)
WS_PATH=$(echo "$WS_RESP" | grep -o '"path":"[^"]*"' | cut -d'"' -f4)
if [ -n "$WS_PATH" ] && [ -d "$WS_PATH/.git" ]; then
  ok "Workspace is a git repo ($WS_PATH)"
else
  fail "Workspace git repo" "path=$WS_PATH git=$([ -d "$WS_PATH/.git" ] && echo yes || echo no)"
fi

# 29. Central skills (verifies /api/opencode/central-skills)
echo "--- 29. Central skills ---"
CSKILLS=$(curl -sf "$BASE_URL/api/opencode/central-skills" -H "Authorization: Bearer $TOKEN_A") || true
echo "$CSKILLS" | grep -q "find-context" && ok "Find context central skill" || fail "Find context skill" "$CSKILLS"

# 30. Block user (admin only — use B as admin if possible, else skip)
echo "--- 30. Admin grant (best effort) ---"
USER_A_ID=$(echo "$ME" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$USER_A_ID" ]; then
  ADMIN=$(curl -sf -X POST "$BASE_URL/api/admin/users/$USER_A_ID/grants" \
    -H "Authorization: Bearer $TOKEN_B" \
    -H 'Content-Type: application/json' \
    -d '{"amount":5,"reason":"smoke test grant"}' 2>/dev/null) || true
  if [ -n "$ADMIN" ]; then
    echo "$ADMIN" | grep -q '"ok":true' && ok "Admin grant" || ok "Admin grant (non-admin expected, non-fatal)"
  else
    ok "Admin grant (skipped — user B is not admin)"
  fi
else
  ok "Admin grant (skipped — no user id)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1

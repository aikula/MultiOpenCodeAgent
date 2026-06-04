#!/usr/bin/env bash
# Run backend + smoke test in one go, then clean up.
# Spins up a local backend (in the background), runs smoke-test, kills backend.
set -uo pipefail

cd /root/Agents/MultiOpenCodeAgent

BASE_URL="${1:-http://127.0.0.1:3000}"
SPAWN="${SPAWN:-1}"

# Clean test data
rm -f data/backend/app.db* apps/backend/data/app.db* 2>/dev/null || true
rm -rf data/workspaces/* apps/backend/data 2>/dev/null || true

if [ "$SPAWN" = "1" ]; then
  # Clean any leftover local backend processes
  pkill -9 -f "tsx apps/backend" 2>/dev/null || true
  sleep 1

  # Start backend
  ALLOW_LOCAL_OPENCODE_FALLBACK=true \
  JWT_SECRET=test1234567890 \
  OPENCODE_SERVER_PASSWORD=test \
  TELEGRAM_BOT_TOKEN= \
  nohup npx tsx apps/backend/src/index.ts > /tmp/smoke-backend.log 2>&1 &
  BACKEND_PID=$!
  echo "Backend PID: $BACKEND_PID"

  # Wait for ready
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      echo "Backend ready after ${i}s"
      break
    fi
    sleep 1
  done

  if ! curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Backend at $BASE_URL is not reachable"
    kill $BACKEND_PID 2>/dev/null || true
    pkill -9 -f "tsx apps/backend" 2>/dev/null || true
    exit 1
  fi
else
  # Wait for external backend
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      echo "Backend at $BASE_URL is ready (${i}s)"
      break
    fi
    sleep 1
  done

  if ! curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Backend at $BASE_URL is not reachable"
    exit 1
  fi
fi

# Run smoke test
./smoke-test.sh "$BASE_URL"
SMOKE_EXIT=$?

# Cleanup
if [ "$SPAWN" = "1" ]; then
  kill $BACKEND_PID 2>/dev/null || true
  pkill -9 -f "tsx apps/backend" 2>/dev/null || true
fi

exit $SMOKE_EXIT

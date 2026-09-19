#!/bin/bash
# Shadow Control Server — start / restart script.
#
# Run once:  ./start_server.sh
#
# This script:
#   1. Kills any existing control server (or the old webhook_listener.py) on port 9000.
#   2. Waits for the port to free up.
#   3. Launches the FastAPI control server under a supervisor loop so it
#      auto-restarts if it crashes (same pattern as BackOffice/restart_backoffice.sh).
#
# Logs go to control.log in this directory. PID is written to control.pid.

set -euo pipefail
cd "$(dirname "$0")"

command -v setsid >/dev/null || { echo "ERROR: setsid not found — run: pkg install util-linux"; exit 1; }
command -v uvicorn >/dev/null || { echo "ERROR: uvicorn not found — run: pip install -r requirements.txt"; exit 1; }

PID_FILE="control.pid"

# ── Kill the running control server if one exists ────────────────────────────
if [ -f "$PID_FILE" ]; then
    OLD_PGID=$(cat "$PID_FILE")
    [ -n "$OLD_PGID" ] && kill -9 -- "-$OLD_PGID" 2>/dev/null || true
    rm -f "$PID_FILE"
fi

# ── Kill the old webhook_listener.py if it is still occupying port 9000 ─────
pkill -f "webhook_listener" 2>/dev/null || true
pkill -f "uvicorn app.main:app.*--port 9000" 2>/dev/null || true

# ── Wait for port 9000 to be free (up to 15 s) ───────────────────────────────
for i in $(seq 1 15); do
    (: < /dev/tcp/127.0.0.1/9000) 2>/dev/null || break
    sleep 1
done

export PYTHONUNBUFFERED=1
export FORCE_COLOR=1

# ── Launch supervisor loop ───────────────────────────────────────────────────
# setsid puts the supervisor in its own process group so that the group-kill
# above hits every child process (the uvicorn workers) on the next restart.
setsid nohup bash -c '
  while true; do
    uvicorn app.main:app --host 0.0.0.0 --port 9000 --use-colors
    echo "[control-server] uvicorn exited ($?) — relaunching in 2s..."
    sleep 2
  done
' > control.log 2>&1 &

echo $! > "$PID_FILE"
echo "✅ Control server starting on port 9000. Logs: $(pwd)/control.log"

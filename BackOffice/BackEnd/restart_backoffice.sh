#!/bin/bash
# Restarts the BackOffice API itself (not BackEnd_V2 — see restart_server.sh
# in BackEnd_V2 for that).
#
# Runs under a tiny supervisor loop rather than a bare uvicorn invocation:
# BackEnd_V2's restart_server.sh ends with an unconditional
# `pkill -9 -f uvicorn` fallback (see its own comments) with no port/module
# qualifier — it matches ANY uvicorn process on the device, including this
# one. So every time BackEnd_V2 restarts (a real git push, or BackOffice's
# own Deploy/Rollback/Restart actions, which all end up running that same
# script), BackOffice's own process becomes collateral damage. The loop
# below relaunches it within ~2s instead of requiring a manual restart.
# (See app/main.py's lifespan for the matching fix that un-sticks any
# deployment/restart record left at "running" by this.)

cd "$(dirname "$0")"

command -v setsid >/dev/null || { echo "ERROR: setsid not found (pkg install util-linux)"; exit 1; }

PID_FILE="backoffice.pid"

# PID_FILE holds the supervisor loop's PGID (setsid makes it the group
# leader, and the uvicorn instances it launches inherit that same group —
# same convention as BackEnd_V2's restart_server.sh) — one signal stops
# both the loop and whatever uvicorn instance is currently running under it.
if [ -f "$PID_FILE" ]; then
    OLD_PGID=$(cat "$PID_FILE")
    [ -n "$OLD_PGID" ] && kill -9 -- "-$OLD_PGID" 2>/dev/null
    rm -f "$PID_FILE"
fi

# Fallback for an instance started outside this script (or before this fix
# existed) with no pidfile to key off. Scoped to this port so it can never
# touch BackEnd_V2's own uvicorn (port 8000).
pkill -9 -f "uvicorn app.main:app.*--port 8100" 2>/dev/null

for i in $(seq 1 15); do
    (: < /dev/tcp/127.0.0.1/8100) 2>/dev/null || break
    sleep 1
done

export PYTHONUNBUFFERED=1

setsid nohup bash -c '
  while true; do
    uvicorn app.main:app --host 0.0.0.0 --port 8100
    echo "[supervisor] uvicorn exited ($?) — relaunching in 2s…"
    sleep 2
  done
' > backoffice.log 2>&1 &
echo $! > "$PID_FILE"

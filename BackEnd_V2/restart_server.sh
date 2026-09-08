#!/bin/bash

cd "$(dirname "$0")"

command -v setsid >/dev/null || { echo "ERROR: setsid not found (pkg install util-linux)"; exit 1; }

PID_FILE="server.pid"

# With --workers N, uvicorn's arbiter forks each worker via multiprocessing's
# "spawn" context, so a worker's cmdline is "python -c ...spawn_main..." and
# never contains "uvicorn" — `pkill -f uvicorn` only ever killed the arbiter,
# leaving the workers (which hold the actual listening socket) alive and the
# port stuck in use. Kill by process group instead: setsid (below) makes the
# arbiter a group leader whose PGID every forked worker inherits, so signalling
# the group reaches all of them no matter what their cmdline looks like.
if [ -f "$PID_FILE" ]; then
    OLD_PGID=$(cat "$PID_FILE")
    [ -n "$OLD_PGID" ] && kill -9 -- "-$OLD_PGID" 2>/dev/null
    rm -f "$PID_FILE"
fi

# Fallback for a server started outside this script (or before this fix
# existed), which has no pidfile to key off: match the arbiter's own cmdline
# and the spawn workers' bootstrap cmdline directly.
pkill -9 -f uvicorn 2>/dev/null
pkill -9 -f "multiprocessing.spawn" 2>/dev/null

# Wait for the port to actually be free before starting a new instance, otherwise
# the new master can hit "Errno 98: Address already in use". Uses bash's built-in
# /dev/tcp probe instead of lsof — Termux's lsof build doesn't support -i.
for i in $(seq 1 15); do
    (: < /dev/tcp/127.0.0.1/8000) 2>/dev/null || break
    sleep 1
done

export FORCE_COLOR=1
export TZ="Asia/Kolkata"
# Redirecting stdout to a file switches Python to full block-buffering (~8KB),
# so log lines sit unflushed for minutes while the server keeps serving fine.
export PYTHONUNBUFFERED=1

# setsid detaches the arbiter into its own session/process group (instead of
# sharing this script's), so the group-kill above only ever targets this
# server's own processes and never the terminal session that launched it.
setsid nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --use-colors --workers 4 > server.log 2>&1 &
echo $! > "$PID_FILE"
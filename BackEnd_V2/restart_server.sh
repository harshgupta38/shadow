#!/bin/bash

# Graceful shutdown (SIGTERM) can hang forever if a worker never reports back
# to the master's reap loop — force-kill immediately instead of waiting on it.
pkill -9 -f uvicorn
sleep 2

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
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --use-colors --workers 4 > server.log 2>&1 &
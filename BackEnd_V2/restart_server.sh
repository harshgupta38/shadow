#!/bin/bash

# --workers spawns child processes that don't all match "uvicorn" in `ps`,
# so pkill -f uvicorn can miss some — kill anything still bound to the port too.
pkill -f uvicorn
# pkill -f "localhost:8000"
# kill -9 $(lsof -t -i:8000) 2>/dev/null

sleep 2
kill -9 $(lsof -t -i:8000) 2>/dev/null

# Wait for the port to actually be free before starting a new instance,
# otherwise the new master can hit "Errno 98: Address already in use".
for i in $(seq 1 15); do
    lsof -i:8000 >/dev/null 2>&1 || break
    sleep 1
done

export FORCE_COLOR=1
export TZ="Asia/Kolkata"
# Redirecting stdout to a file switches Python to full block-buffering (~8KB),
# so log lines sit unflushed for minutes while the server keeps serving fine.
export PYTHONUNBUFFERED=1
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --use-colors --workers 4 > server.log 2>&1 &
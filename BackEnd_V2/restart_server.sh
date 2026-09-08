#!/bin/bash

# --workers forks children that keep the same "uvicorn" argv on Linux (fork start
# method), so pkill -f uvicorn already catches them too.
pkill -f uvicorn
# pkill -f "localhost:8000"
# kill -9 $(lsof -t -i:8000) 2>/dev/null

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
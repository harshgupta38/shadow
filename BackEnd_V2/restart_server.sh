#!/bin/bash

pkill -f uvicorn
# pkill -f "localhost:8000"
# kill -9 $(lsof -t -i:8000) 2>/dev/null

sleep 2

export FORCE_COLOR=1
export TZ="Asia/Kolkata"
# Redirecting stdout to a file switches Python to full block-buffering (~8KB),
# so log lines sit unflushed for minutes while the server keeps serving fine.
export PYTHONUNBUFFERED=1
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --use-colors > server.log 2>&1 &
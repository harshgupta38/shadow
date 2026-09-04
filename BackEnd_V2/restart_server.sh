#!/bin/bash

pkill -f uvicorn
# pkill -f "localhost:8000"
# kill -9 $(lsof -t -i:8000) 2>/dev/null

sleep 2

export FORCE_COLOR=1
export TZ="Asia/Kolkata"
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --use-colors > server.log 2>&1 &
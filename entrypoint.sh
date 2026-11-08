#!/bin/bash
set -e

# Start bgutil-pot HTTP server in background on port 4416
if command -v bgutil-pot >/dev/null 2>&1; then
    echo "[entrypoint] Starting bgutil-pot HTTP server on 127.0.0.1:4416..."
    bgutil-pot server --port 4416 --host 127.0.0.1 &
    POT_PID=$!
    
    # Wait up to 5s for the server to be ready
    for i in $(seq 1 10); do
        if curl -s http://127.0.0.1:4416/ping >/dev/null 2>&1; then
            echo "[entrypoint] bgutil-pot server is ready on 127.0.0.1:4416"
            break
        fi
        sleep 0.5
    done
else
    echo "[entrypoint] Warning: bgutil-pot binary not found, continuing without local POT daemon..."
fi

# Start FastAPI production server (binds to $PORT dynamically, defaults to 8000)
echo "[entrypoint] Starting Uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

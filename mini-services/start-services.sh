#!/bin/bash
# CARTINT mini-services startup script.
#
# Starts the threat-feed-service (port 3003) and watchdog-scheduler (port 3004)
# as detached background processes. Called by the system-status endpoint when
# it detects the services are down (self-healing).
#
# Usage: bash mini-services/start-services.sh

set -e

MINI_SERVICES_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$MINI_SERVICES_DIR"

is_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -q ":$port "
  else
    return 1
  fi
}

# Start threat-feed-service (port 3003) if not already running
if ! is_listening 3003; then
  cd "$MINI_SERVICES_DIR/threat-feed-service"
  nohup setsid bun index.ts >> "$LOG_DIR/threat-feed-service.log" 2>&1 < /dev/null &
  echo "[start-services] started threat-feed-service on port 3003"
else
  echo "[start-services] threat-feed-service already running on port 3003"
fi

# Start watchdog-scheduler (port 3004) if not already running
if ! is_listening 3004; then
  cd "$MINI_SERVICES_DIR/watchdog-scheduler"
  nohup setsid bun index.ts >> "$LOG_DIR/watchdog-scheduler.log" 2>&1 < /dev/null &
  echo "[start-services] started watchdog-scheduler on port 3004"
else
  echo "[start-services] watchdog-scheduler already running on port 3004"
fi

# Give them a moment to bind
sleep 2

# Report final status
echo "[start-services] status:"
is_listening 3003 && echo "  port 3003: LISTENING" || echo "  port 3003: NOT listening"
is_listening 3004 && echo "  port 3004: LISTENING" || echo "  port 3004: NOT listening"

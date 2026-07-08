#!/bin/bash
# CARTINT mini-services startup script.
#
# Starts the threat-feed-service (port 3003) and watchdog-scheduler (port 3004)
# as detached background processes. Called by the system-status endpoint when
# it detects the services are down (self-healing).
#
# Usage: bash mini-services/start-services.sh
# Works from any project root (uses script's own directory, not hardcoded paths).

set -e

# Resolve the script's directory (works on any machine)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MINI_SERVICES_DIR="$SCRIPT_DIR"
LOG_DIR="$SCRIPT_DIR"

# Start threat-feed-service (port 3003) if not already running
if ! lsof -i:3003 -sTCP:LISTEN >/dev/null 2>&1; then
  cd "$MINI_SERVICES_DIR/threat-feed-service"
  nohup setsid bun index.ts >> "$LOG_DIR/threat-feed-service.log" 2>&1 < /dev/null &
  echo "[start-services] started threat-feed-service on port 3003"
else
  echo "[start-services] threat-feed-service already running on port 3003"
fi

# Start watchdog-scheduler (port 3004) if not already running
if ! lsof -i:3004 -sTCP:LISTEN >/dev/null 2>&1; then
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
lsof -i:3003 -sTCP:LISTEN >/dev/null 2>&1 && echo "  port 3003: LISTENING" || echo "  port 3003: NOT listening"
lsof -i:3004 -sTCP:LISTEN >/dev/null 2>&1 && echo "  port 3004: LISTENING" || echo "  port 3004: NOT listening"

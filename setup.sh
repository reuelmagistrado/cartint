#!/bin/bash
# CARTINT setup script — checks prerequisites and guides AI configuration.
#
# Usage: bun run setup
#
# This script:
#   1. Checks that bun is installed
#   2. Installs npm dependencies
#   3. Creates the SQLite database + pushes the Prisma schema
#   4. Checks for AI provider config (env vars or local Ollama)
#   5. Checks for Tor (optional, for dark-web scraping)
#   6. Prints next steps

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
}

print_ok() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

print_err() {
  echo -e "  ${RED}✗${NC} $1"
}

print_header "CARTINT Setup"

# ─── 1. Bun ──────────────────────────────────────────────────────────────────
print_header "1/5  Checking Bun"
if command -v bun &> /dev/null; then
  BUN_VER=$(bun --version)
  print_ok "Bun v$BUN_VER installed"
else
  print_err "Bun not found. Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# ─── 2. Dependencies ─────────────────────────────────────────────────────────
print_header "2/5  Installing dependencies"
bun install
print_ok "Dependencies installed"

# ─── 3. Database ────────────────────────────────────────────────────────────
print_header "3/5  Setting up database"
mkdir -p db
if [ ! -f ".env" ]; then
  printf '%s\n' 'DATABASE_URL=file:./db/custom.db' > .env
  print_ok "Created .env with a relative SQLite DATABASE_URL"
elif ! grep -q '^DATABASE_URL=' .env; then
  printf '%s\n' 'DATABASE_URL=file:./db/custom.db' >> .env
  print_ok "Added relative SQLite DATABASE_URL to .env"
fi
bun run db:push
print_ok "Database schema pushed (SQLite at db/custom.db)"

# ─── 4. AI Provider Config ───────────────────────────────────────────────────
print_header "4/5  Checking AI provider configuration"

AI_CONFIGURED=false

# Check environment variables
if [ -n "$AI_API_KEY" ]; then
  print_ok "AI_API_KEY environment variable is set (provider: ${AI_PROVIDER:-custom})"
  AI_CONFIGURED=true
elif [ -n "$OPENAI_API_KEY" ]; then
  print_ok "OPENAI_API_KEY environment variable is set"
  AI_CONFIGURED=true
elif [ -n "$ANTHROPIC_API_KEY" ]; then
  print_ok "ANTHROPIC_API_KEY environment variable is set"
  AI_CONFIGURED=true
elif [ -n "$GOOGLE_API_KEY" ]; then
  print_ok "GOOGLE_API_KEY environment variable is set"
  AI_CONFIGURED=true
elif [ "${AI_PROVIDER:-}" = "ollama" ] || curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  print_ok "Ollama/local AI endpoint appears available"
  AI_CONFIGURED=true
fi

if [ "$AI_CONFIGURED" = false ]; then
  print_warn "No AI provider configured."
  echo ""
  echo -e "  ${BOLD}CARTINT works without AI (heuristic fallback), but AI features are recommended:${NC}"
  echo -e "    • AI threat classification (false-positive gate)"
  echo -e "    • AI-generated CTI reports"
  echo -e "    • AI IOC extraction"
  echo -e "    • AI dark-web query refinement"
  echo ""
  echo -e "  ${BOLD}Option A: OpenAI / Anthropic / Google${NC}"
  echo -e "    Set in .env or environment:"
  echo -e "    ${CYAN}AI_PROVIDER=openai${NC}  (or anthropic, google)"
  echo -e "    ${CYAN}AI_API_KEY=sk-...${NC}"
  echo -e "    ${CYAN}AI_MODEL=gpt-4o${NC}  (optional)"
  echo ""
  echo -e "  ${BOLD}Option B: Ollama (free, local)${NC}"
  echo -e "    Install from ${CYAN}https://ollama.com/download${NC}, then:"
  echo -e "    ${CYAN}ollama pull llama3.2${NC}"
  echo -e "    ${CYAN}AI_PROVIDER=ollama AI_BASE_URL=http://localhost:11434/v1${NC}"
  echo ""
  echo -e "  ${BOLD}Option C: Configure via the Settings UI${NC}"
  echo -e "    Start the app (${CYAN}bun run dev${NC}), open the CTI Reports tab,"
  echo -e "    and use the AI Provider Settings panel."
  echo ""
  echo -e "  You can also skip this step and configure later — the app runs with"
  echo -e "  heuristic fallbacks (keyword-based classification + template reports)."
fi

# ─── 5. Tor (optional) ───────────────────────────────────────────────────────
print_header "5/5  Checking Tor (optional, for dark-web scraping)"
if command -v tor &> /dev/null; then
  print_ok "Tor installed"
  if pgrep -x tor &> /dev/null || lsof -i:9050 &> /dev/null; then
    print_ok "Tor is running on port 9050"
  else
    print_warn "Tor installed but not running. Start with: tor &"
    echo -e "    Dark-web .onion scraping requires Tor. RansomLook clearnet API works without it."
  fi
else
  print_warn "Tor not installed (optional)."
  echo -e "    Without Tor, .onion scraping is disabled. The RansomLook clearnet API"
  echo -e "    still works for ransomware leak-site monitoring."
  echo -e "    Install: ${CYAN}brew install tor${NC} (macOS) or ${CYAN}sudo apt install tor${NC} (Linux)"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
print_header "Setup Complete"
echo ""
echo -e "  ${BOLD}Start the dashboard:${NC}"
echo -e "    ${CYAN}bun run dev${NC}"
echo -e "    Open ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  ${BOLD}Mini-services (auto-started by the dashboard):${NC}"
echo -e "    • threat-feed-service (port 3003) — WebSocket live updates"
echo -e "    • watchdog-scheduler (port 3004) — health monitoring + scheduled scrapes"
echo ""
if [ "$AI_CONFIGURED" = false ]; then
  echo -e "  ${YELLOW}⚠  AI features are in fallback mode. Configure an AI provider for full functionality.${NC}"
  echo ""
fi

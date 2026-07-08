#!/bin/bash
# CARTINT setup script — checks prerequisites and guides AI configuration.
#
# Usage: bun run setup
#
# This script:
#   1. Checks that bun is installed
#   2. Installs npm dependencies
#   3. Creates the SQLite database + pushes the Prisma schema
#   4. Checks for AI provider config (.z-ai-config or env vars)
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

# Create .env from .env.example if it doesn't exist (fresh clone)
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    print_ok "Created .env from .env.example"
  else
    # Fallback: create a minimal .env with just the database URL
    echo "DATABASE_URL=file:./db/custom.db" > .env
    print_ok "Created .env with default DATABASE_URL"
  fi
fi

if [ ! -d "db" ]; then
  mkdir -p db
  print_ok "Created db/ directory"
fi
bun run db:push
print_ok "Database schema pushed (SQLite at db/custom.db)"

# ─── 4. AI Provider Config ───────────────────────────────────────────────────
print_header "4/5  Checking AI provider configuration"

AI_CONFIGURED=false

# Check .z-ai-config (project root, home dir)
for CONFIG_PATH in ".z-ai-config" "$HOME/.z-ai-config" "/etc/.z-ai-config"; do
  if [ -f "$CONFIG_PATH" ]; then
    if grep -q '"apiKey"' "$CONFIG_PATH" 2>/dev/null; then
      print_ok "Z.AI config found at $CONFIG_PATH"
      AI_CONFIGURED=true
      break
    fi
  fi
done

# Check environment variables
if [ "$AI_CONFIGURED" = false ]; then
  if [ -n "$AI_API_KEY" ]; then
    print_ok "AI_API_KEY environment variable is set (provider: ${AI_PROVIDER:-zai})"
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
  fi
fi

if [ "$AI_CONFIGURED" = false ]; then
  print_err "AI provider NOT configured. AI is REQUIRED for CARTINT to function."
  echo ""
  echo -e "  ${BOLD}CARTINT requires an AI provider for:${NC}"
  echo -e "    • Threat classification (false-positive gate)"
  echo -e "    • CTI report generation"
  echo -e "    • IOC extraction"
  echo -e "    • ATM mapping"
  echo -e "    • Dark-web query refinement"
  echo ""
  echo -e "  ${BOLD}Option A: Z.AI (default, easiest)${NC}"
  echo -e "    Get an API key from ${CYAN}https://z.ai${NC}, then:"
  echo -e "    ${CYAN}cat > .z-ai-config << 'EOF'"
  echo -e '    {"baseUrl":"https://api.z.ai/api/v1","apiKey":"YOUR_KEY"}'
  echo -e "    EOF${NC}"
  echo ""
  echo -e "  ${BOLD}Option B: OpenAI / Anthropic / Google / Custom${NC}"
  echo -e "    Set in .env:"
  echo -e "    ${CYAN}AI_PROVIDER=openai${NC}  (or anthropic, google, custom)"
  echo -e "    ${CYAN}AI_API_KEY=sk-...${NC}"
  echo -e "    ${CYAN}AI_MODEL=gpt-4o${NC}  (optional)"
  echo ""
  echo -e "  ${BOLD}Option C: Ollama (free, local)${NC}"
  echo -e "    Install from ${CYAN}https://ollama.com/download${NC}, then:"
  echo -e "    ${CYAN}ollama pull llama3.2${NC}"
  echo -e "    ${CYAN}AI_PROVIDER=ollama AI_BASE_URL=http://localhost:11434/v1${NC}"
  echo ""
  echo -e "  ${BOLD}Option D: Configure via the in-app setup screen${NC}"
  echo -e "    Start the app (${CYAN}bun run build && bun run start${NC}), and the"
  echo -e "    setup screen will guide you through AI provider configuration."
  echo ""
  echo -e "  ${YELLOW}⚠  The dashboard will NOT load until an AI provider is configured.${NC}"
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
echo -e "  ${BOLD}Build and start the dashboard:${NC}"
echo -e "    ${CYAN}bun run build${NC}"
echo -e "    ${CYAN}bun run start${NC}"
echo -e "    Open ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  ${BOLD}Mini-services (auto-started by the dashboard):${NC}"
echo -e "    • threat-feed-service (port 3003) — WebSocket live updates"
echo -e "    • watchdog-scheduler (port 3004) — health monitoring + scheduled scrapes"
echo ""
if [ "$AI_CONFIGURED" = false ]; then
  echo -e "  ${RED}⚠  AI is NOT configured. The dashboard will show a setup screen on first load.${NC}"
  echo ""
fi

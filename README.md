# CARTINT — Automotive Threat Intelligence Dashboard

**CARTINT** is an open-source, AI-powered automotive cyber threat intelligence platform that aggregates dark-web OSINT from multiple sources, classifies every item with AI to eliminate false positives, and maps accepted threats to the Auto-ISAC Automotive Threat Matrix (ATM).

## Features

- **Multi-source dark-web OSINT** — 4+ intelligence sources (RansomLook, BleepingComputer, The Hacker News, ASRG security advisories)
- **AI-powered false-positive gate** — every scraped item is classified by AI as automotive-relevant or not, with a confidence score (≥70% required)
- **AI-generated CTI reports** — 6 report types (Weekly Digest, Threat Actor Profile, Incident Report, Campaign Analysis, Sector Assessment, Ad-Hoc) with streaming generation
- **Auto-ISAC ATM mapping** — all threats mapped to 14 tactics / 77 techniques, with AI-powered 5-step attacker-intent-first remapping
- **Real-time dashboard** — live threat feed, severity distribution, geographic map, actor spotlight, trending ATM tactics
- **Tor dark-web scraping** — 6-engine .onion search + RansomLook leak-site monitoring
- **Scheduled scrapes** — configurable per-source intervals with watchdog health monitoring
- **Multi-model AI support** — choose from 6 AI providers (Z.AI, OpenAI, Anthropic, Google, Ollama, or any OpenAI-compatible endpoint)

---

## Prerequisites

Before you begin, ensure you have:

| Requirement | Version | How to install |
|-------------|---------|----------------|
| **Bun** | ≥1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | ≥18 | [nodejs.org](https://nodejs.org) (Bun includes Node compat) |
| **An AI provider** | — | See [AI Provider Configuration](#ai-provider-configuration) below |

**Optional:**

| Requirement | Purpose | How to install |
|-------------|---------|----------------|
| **Tor** | Dark-web .onion scraping | `brew install tor` (macOS) / `sudo apt install tor` (Linux) |
| **Ollama** | Free local AI (no API key) | [ollama.com/download](https://ollama.com/download) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/reuelmagistrado/cartint.git
cd cartint

# 2. Run the setup script (installs dependencies, creates the database)
bun run setup

# 3. Configure your AI provider (REQUIRED — see below)
#    Create a .z-ai-config file OR set AI_PROVIDER + AI_API_KEY in .env

# 4. Build and start the dashboard
bun run build
bun run start

# 5. Open http://localhost:3000
```

On first load, the dashboard will show an **AI Setup Required** screen if no AI provider is configured. Choose your provider, enter your API key, and click "Save & Continue".

> ⚠️ **AI configuration is required.** The dashboard will not function without an AI provider. See [AI Provider Configuration](#ai-provider-configuration) below.

---

## What Needs to Be Running Before the Dashboard

CARTINT has **3 components**. The dashboard (Next.js) is the main one — the other two are **mini-services** that auto-start when the dashboard loads:

| Component | Port | Purpose | Auto-started? |
|-----------|------|---------|---------------|
| **Next.js Dashboard** | 3000 | The main web app (API routes, UI, scraping) | You start this with `bun run start` |
| **threat-feed-service** | 3003 | WebSocket server for real-time threat notifications | ✅ Auto-started by `/api/system-status` |
| **watchdog-scheduler** | 3004 | Health monitoring + scheduled scrape triggers | ✅ Auto-started by `/api/system-status` |

**You only need to start the Next.js dashboard** (`bun run build && bun run start`). When you open the dashboard in your browser, the System Status panel detects if the mini-services are down and automatically starts them via `mini-services/start-services.sh`. No manual intervention needed.

### How the auto-start works

1. The dashboard's System Status panel polls `/api/system-status` every 30s
2. That endpoint pings `localhost:3003/health` and `localhost:3004/health`
3. If either is down, it spawns `bash mini-services/start-services.sh` (detached)
4. The script starts the missing mini-service(s) as background processes
5. On the next poll (30s later), the services show as "ok"

If you prefer to start them manually (e.g., for debugging):

```bash
# Terminal 1 — threat-feed-service
cd mini-services/threat-feed-service
bun install
bun run dev

# Terminal 2 — watchdog-scheduler
cd mini-services/watchdog-scheduler
bun run dev

# Terminal 3 — the dashboard
bun run build
bun run start
```

---

## AI Provider Configuration

CARTINT supports **6 AI providers**. AI is **required** for threat classification, report generation, IOC extraction, and ATM mapping. Choose one:

### Option A: Z.AI (default)

Z.AI is the default provider. Create a `.z-ai-config` file in the project root:

```json
{
  "baseUrl": "https://api.z.ai/api/v1",
  "apiKey": "your-z-ai-api-key"
}
```

Get an API key from [https://z.ai](https://z.ai).

### Option B: OpenAI

Set in `.env`:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-your-openai-key
AI_MODEL=gpt-4o           # optional, defaults to gpt-4o
```

Get an API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys).

### Option C: Anthropic Claude

```bash
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-your-anthropic-key
AI_MODEL=claude-sonnet-4-20250514  # optional
```

Get an API key from [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

### Option D: Google Gemini

```bash
AI_PROVIDER=google
AI_API_KEY=your-google-api-key
AI_MODEL=gemini-2.0-flash  # optional
```

Get an API key from [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### Option E: Ollama (free, local)

No API key needed — runs entirely on your machine:

```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a model
ollama pull llama3.2

# 3. Configure CARTINT in .env
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
```

### Option F: Custom OpenAI-Compatible Provider

Connect to any OpenAI-compatible API endpoint (Azure OpenAI, Together AI, Anyscale, vLLM, LM Studio, etc.):

```bash
AI_PROVIDER=custom
AI_API_KEY=your-api-key
AI_BASE_URL=https://your-provider.com/v1
AI_MODEL=your-model-id
```

### Option G: In-App Setup Screen

If you start the dashboard without any AI configuration, the first load shows an **AI Setup Required** screen. Choose your provider, enter your API key, and click "Save & Continue". Settings are saved at runtime (no restart needed).

### AI is required

An AI provider must be configured before the dashboard will function. AI powers:

- **Threat classification** — every scraped item is classified as automotive-relevant or not, with a confidence score
- **CTI report generation** — AI-written natural-language analysis for all 6 report types
- **IOC extraction** — AI-extracted CVEs, actors, data types, components
- **Dark-web query refinement** — AI-refined search queries
- **ATM mapping** — AI-mapped tactics/techniques with attacker-intent analysis

---

## Tor Setup (optional, for dark-web scraping)

Tor is required for:
- .onion search (6 dark-web search engines)
- .onion page scraping

**Without Tor**, the `darkweb` source still works via the RansomLook clearnet API (ransomware leak-site monitoring). Other sources (BleepingComputer, The Hacker News, ASRG advisories) don't need Tor.

### Install Tor

**macOS:**
```bash
brew install tor
tor &   # start in background
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install tor
sudo service tor start
```

**Windows:**
Download from [https://www.torproject.org/download/](https://www.torproject.org/download/) and run Tor.

### Verify Tor is running

```bash
curl --socks5-hostname 127.0.0.1:9050 https://check.torproject.org/api/ip
# Should return: {"IsTor":true, ...}
```

### Tor configuration

Default settings (in `.env`):

```bash
TOR_SOCKS_HOST=127.0.0.1
TOR_SOCKS_PORT=9050
```

---

## Getting Live Threat Data

The dashboard starts with an empty database. To populate it with live threats:

1. Open the dashboard at `http://localhost:3000`
2. Go to the **Overview** tab
3. In the **Intelligence Sources** panel, click **"Scrape All"**
4. Wait 30-60s — each source fetches live data from public APIs:
   - `darkweb` → RansomLook API (ransomware leak-site monitoring)
   - `bleepingcomputer` → BleepingComputer RSS feed
   - `thehackernews` → The Hacker News RSS feed
   - `asrg-advisories` → ASRG automotive security advisories
5. AI classifies each scraped item (isAutomotive? relevanceScore ≥ 70?)
6. Accepted threats appear in the live feed automatically

### Scheduled scrapes

To auto-scrape on intervals, go to the **Scrape Schedule** panel and set a source's interval (15m / 30m / 1h / 3h / 6h). The watchdog-scheduler mini-service triggers scrapes automatically.

---

## Full Configuration

All configuration is via environment variables (`.env` file) or the in-app setup screen.

### AI Provider
| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `zai` | `zai` \| `openai` \| `anthropic` \| `google` \| `ollama` \| `custom` |
| `AI_API_KEY` | (none) | API key for the provider (not needed for Ollama) |
| `AI_BASE_URL` | (provider default) | Override the API base URL |
| `AI_MODEL` | (provider default) | Override the model name |

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database path (Prisma) |

### Tor
| Variable | Default | Description |
|----------|---------|-------------|
| `TOR_SOCKS_HOST` | `127.0.0.1` | Tor SOCKS5 proxy host |
| `TOR_SOCKS_PORT` | `9050` | Tor SOCKS5 proxy port |

### Mini-Services
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_URL` | `http://localhost:3000` | Next.js URL (for the watchdog-scheduler) |
| `THREAT_FEED_URL` | `http://localhost:3003` | threat-feed-service URL |

### Scraper
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_DOWNLOAD_BYTES` | `1000000` | Max download size per page (1MB) |
| `MAX_EXTRACTED_TEXT` | `50000` | Max text extracted per page (50KB) |
| `SCRAPE_TIMEOUT_TOR` | `45` | Tor scrape timeout (seconds) |
| `SCRAPE_MAX_WORKERS` | `5` | Concurrent scrape workers |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Dashboard (:3000)          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Overview │  │ATM Matrix│  │  CTI Reports      │  │
│  │ (charts, │  │ (14 tac, │  │  (6 report types, │  │
│  │  feed,   │  │ 77 tech, │  │   AI-generated)   │  │
│  │  map)    │  │  AI map) │  │                   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────┤
│              API Routes (Next.js)                    │
│  /api/stats  /api/threats  /api/scrape  /api/atm    │
│  /api/cti-reports/generate  /api/ai-settings         │
├─────────────────────────────────────────────────────┤
│           AI Provider Layer (multi-model)            │
│  ┌──────┐  ┌────────┐  ┌──────────┐  ┌────────┐    │
│  │ Z.AI │  │ OpenAI │  │Anthropic │  │ Gemini │    │
│  └──────┘  └────────┘  └──────────┘  └────────┘    │
│  ┌────────────────┐  ┌──────────────────────────┐   │
│  │ Ollama (local) │  │ Custom OpenAI-compatible │   │
│  └────────────────┘  └──────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│              Scraper Pipeline                         │
│  Sources → Pre-filter → AI Classify → ATM Map → DB  │
├─────────────────────────────────────────────────────┤
│           Mini-Services (auto-started)               │
│  threat-feed-service (:3003) — WebSocket live feed   │
│  watchdog-scheduler (:3004) — health + scheduled     │
├─────────────────────────────────────────────────────┤
│              SQLite (Prisma ORM)                      │
│  Threat | Source | ScrapeLog | Report                │
└─────────────────────────────────────────────────────┘
```

### Sources

| Source | Type | Needs Tor? | Description |
|--------|------|-----------|-------------|
| `darkweb` | Dark-web | Optional | RansomLook leak monitoring (clearnet) + Tor-based .onion search |
| `bleepingcomputer` | Security RSS | No | Dark-web breach reporting |
| `thehackernews` | Security RSS | No | Threat-actor activity news |
| `asrg-advisories` | Advisories | No | ASRG automotive security advisories |

### AI Features

1. **Threat Classification** (`src/lib/scraper/classifier.ts`) — every scraped item is batch-classified: `isAutomotive`, `relevanceScore` (0-100), `automotiveCategory`, `atmTactic`, `atmTechnique`, `severity`
2. **CTI Report Generation** (`src/lib/cti-report-generator.ts`) — 6 report types with async job-based generation
3. **IOC Extraction** (`src/app/api/threats/[id]/iocs/route.ts`) — extracts CVEs, actors, data types, components, countries
4. **Dark-web Query Refinement** (`src/lib/scraper/darkweb-llm-filter.ts`) — refines search queries for dark-web engines
5. **ATM Mapping** (`src/lib/scraper/atm-mapper.ts`) — attacker-intent-first 5-step threat analysis

---

## Development

```bash
# Install dependencies
bun install

# Push database schema
bun run db:push

# Build for production
bun run build

# Start the production server
bun run start

# Lint
bun run lint

# Type check
bunx tsc --noEmit
```

### Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Prisma ORM + SQLite
- **AI**: Multi-model (Z.AI, OpenAI, Anthropic, Google, Ollama, Custom)
- **Charts**: Recharts
- **Animation**: Framer Motion
- **Real-time**: Socket.io (threat-feed-service)
- **Dark-web**: Tor SOCKS5 + RansomLook API
- **Icons**: Lucide

### Project Structure

```
cartint/
├── src/
│   ├── app/                    # Next.js App Router (pages + API routes)
│   │   ├── api/                # API routes (stats, threats, scrape, reports, etc.)
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Main dashboard page
│   ├── components/             # React components (dashboard panels)
│   ├── hooks/                  # Custom React hooks (threat stream, watchdog, etc.)
│   └── lib/                    # Core libraries
│       ├── ai-provider.ts      # Multi-model AI provider abstraction
│       ├── atm.ts              # Auto-ISAC ATM taxonomy (14 tactics, 77 techniques)
│       ├── cti-report-generator.ts # CTI report generation (6 types)
│       ├── db.ts               # Prisma database client
│       ├── report-jobs.ts      # Async report job store
│       └── scraper/            # Scraping pipeline
│           ├── classifier.ts   # AI threat classification
│           ├── atm-mapper.ts   # AI ATM mapping (5-step methodology)
│           ├── sources.ts      # Source adapters (darkweb, RSS, advisories)
│           ├── tor.ts          # Tor SOCKS5 proxy helper
│           └── ...
├── mini-services/              # Background mini-services
│   ├── threat-feed-service/    # WebSocket server (port 3003)
│   ├── watchdog-scheduler/     # Health monitor + scheduler (port 3004)
│   └── start-services.sh       # Auto-start script
├── prisma/                     # Prisma schema
├── public/                     # Static assets (logo.svg, robots.txt)
├── .env.example                # Environment variable template
├── setup.sh                    # First-run setup script
└── package.json
```

---

## Troubleshooting

### Dashboard shows "AI Setup Required" screen
Configure an AI provider:
- **Z.AI**: Create `.z-ai-config` in the project root with `{"baseUrl":"https://api.z.ai/api/v1","apiKey":"your-key"}`
- **Other providers**: Set `AI_PROVIDER` + `AI_API_KEY` in `.env`
- **In-app**: Use the setup screen to configure at runtime

### Mini-services show "down" in System Status
The mini-services auto-start within 30s of opening the dashboard. If they don't:
```bash
# Start them manually
cd mini-services/threat-feed-service && bun install && bun run dev &
cd mini-services/watchdog-scheduler && bun run dev &
```

### Scrape returns "empty" for all sources
This is normal — it means the sources had no new automotive threats at scrape time. The sources return data only when there are new incidents. Try again later, or check that your internet connection can reach the public APIs.

### Tor scraping doesn't work
Verify Tor is running:
```bash
curl --socks5-hostname 127.0.0.1:9050 https://check.torproject.org/api/ip
```
If this fails, start Tor: `tor &` (macOS/Linux).

### Database errors
Reset the database:
```bash
rm -rf db/
bun run db:push
```

---

## License

MIT

## Acknowledgments

- [Auto-ISAC](https://auto-isac.com/) — Automotive Threat Matrix (ATM)
- [RansomLook](https://www.ransomlook.io/) — Ransomware leak-site monitoring API
- [ASRG](https://asrg.io/) — Automotive Security Research Group advisories

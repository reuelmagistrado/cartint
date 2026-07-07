# CARTINT — Automotive Threat Intelligence Dashboard

**CARTINT** is an open-source, AI-powered automotive cyber threat intelligence platform that aggregates dark-web OSINT from multiple sources, classifies every item with AI to eliminate false positives, and maps accepted threats to the Auto-ISAC Automotive Threat Matrix (ATM).

## Features

- **Multi-source dark-web OSINT** — 4+ intelligence sources (RansomLook, BleepingComputer, The Hacker News, NVD automotive CVEs)
- **AI-powered false-positive gate** — every scraped item is classified by AI as automotive-relevant or not, with a confidence score (≥70% required)
- **AI-generated CTI reports** — 6 report types (Weekly Digest, Threat Actor Profile, Incident Report, Campaign Analysis, Sector Assessment, Ad-Hoc) with streaming generation
- **Auto-ISAC ATM mapping** — all threats mapped to 14 tactics / 77 techniques
- **Real-time dashboard** — live threat feed, severity distribution, geographic map, actor spotlight, trending ATM tactics
- **Tor dark-web scraping** — Robin-style 6-engine .onion search + RansomLook leak-site monitoring
- **Scheduled scrapes** — configurable per-source intervals with watchdog health monitoring

## Quick Start

```bash
# 1. Clone
git clone https://github.com/reuelmagistrado/cartint-dashboard.git
cd cartint-dashboard

# 2. Run setup (installs deps, creates DB, checks AI + Tor config)
bun run setup

# 3. Start the dashboard
bun run dev

# 4. Open http://localhost:3000
```

The dashboard auto-seeds with 47+ sample automotive threats on first run, so you can explore the UI immediately.

### Production mode (no dev overlay, faster, recommended for daily use)

```bash
bun run build
bun run start
```

---

## AI Provider Configuration

CARTINT supports **5 AI providers**. You can configure via environment variables, config files, or the in-app Settings UI (CTI Reports tab → AI Provider Settings panel).

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

Set in `.env` or environment:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-your-openai-key
AI_MODEL=gpt-4o           # optional, defaults to gpt-4o
AI_BASE_URL=https://api.openai.com/v1  # optional
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

# 3. Configure CARTINT
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
```

### Option F: In-App Settings UI

Start the dashboard (`bun run dev`), go to the **CTI Reports** tab, and use the **AI Provider Settings** panel to select your provider and enter your API key. Settings are saved at runtime (no restart needed).

### What works without AI?

If no AI provider is configured, CARTINT runs in **fallback mode** with graceful degradation:

| Feature | With AI | Without AI (fallback) |
|---------|---------|----------------------|
| Threat classification | AI-powered relevance + confidence scoring | Heuristic keyword-based classifier |
| CTI report generation | AI-written natural-language analysis | Structured template report (all 13 sections, data-accurate) |
| IOC extraction | AI-extracted CVEs, actors, data types | Regex-based extraction (CVEs, IPs, hashes, domains) |
| Dark-web query refinement | AI-refined search queries | Uses raw search query |
| ATM mapping | AI-refined tactic/technique mapping | Heuristic keyword-to-tactic mapping |

**The dashboard fully works without AI** — you just get less nuanced analysis. Configure an AI provider for the full experience.

---

## Tor Setup (optional, for dark-web scraping)

Tor is required for:
- .onion search (6 dark-web search engines)
- .onion page scraping

**Without Tor**, the `darkweb` source still works via the RansomLook clearnet API (ransomware leak-site monitoring). Other sources (BleepingComputer, The Hacker News, NVD CVEs) don't need Tor.

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

## Full Configuration

All configuration is via environment variables (`.env` file) or the in-app Settings UI.

### AI Provider
| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `zai` | `zai` \| `openai` \| `anthropic` \| `google` \| `ollama` |
| `AI_API_KEY` | (none) | API key for the provider (not needed for Ollama) |
| `AI_BASE_URL` | (provider default) | Override the API base URL |
| `AI_MODEL` | (provider default) | Override the model name |

### Tor
| Variable | Default | Description |
|----------|---------|-------------|
| `TOR_SOCKS_HOST` | `127.0.0.1` | Tor SOCKS5 proxy host |
| `TOR_SOCKS_PORT` | `9050` | Tor SOCKS5 proxy port |

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database path (Prisma) |

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
│  │  feed,   │  │ 77 tech) │  │   AI-generated)   │  │
│  │  map)    │  │          │  │                   │  │
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
│  ┌────────────────┐                                  │
│  │ Ollama (local) │                                  │
│  └────────────────┘                                  │
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
| `darkweb` | Dark-web | Optional | RansomLook leak monitoring (clearnet) + Robin-style Tor search |
| `bleepingcomputer` | Security RSS | No | Dark-web breach reporting |
| `thehackernews` | Security RSS | No | Threat-actor activity news |
| `nvd-cve` | CVE | No | NIST NVD automotive CVEs |

### AI Features

1. **Threat Classification** (`src/lib/scraper/classifier.ts`) — every scraped item is batch-classified: `isAutomotive`, `relevanceScore` (0-100), `automotiveCategory`, `atmTactic`, `atmTechnique`, `severity`
2. **CTI Report Generation** (`src/lib/cti-report-generator.ts`) — 6 report types with async job-based generation
3. **IOC Extraction** (`src/app/api/threats/[id]/iocs/route.ts`) — extracts CVEs, actors, data types, components, countries
4. **Dark-web Query Refinement** (`src/lib/scraper/darkweb-llm-filter.ts`) — refines search queries for dark-web engines
5. **ATM Mapping** (`src/lib/scraper/atm-mapper.ts`) — attacker-intent-first threat analysis

### Graceful Degradation

Every AI call is wrapped in a try/catch that falls back to a deterministic alternative:
- Classification → heuristic classifier (keyword-based)
- Report generation → template report (structured, all sections)
- IOC extraction → regex extraction
- Dark-web filtering → returns unfiltered results
- ATM mapping → keyword-to-tactic mapping

**The app never crashes when AI is unavailable.**

---

## Development

```bash
# Install dependencies
bun install

# Push database schema
bun run db:push

# Start dev server
bun run dev

# Lint
bun run lint

# Type check
bunx tsc --noEmit
```

### Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Prisma ORM + SQLite
- **AI**: Multi-model (Z.AI, OpenAI, Anthropic, Google, Ollama)
- **Charts**: Recharts
- **Animation**: Framer Motion
- **Real-time**: Socket.io (threat-feed-service)
- **Dark-web**: Tor SOCKS5 + RansomLook API
- **Icons**: Lucide

---

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Acknowledgments

- [Auto-ISAC](https://auto-isac.com/) — Automotive Threat Matrix (ATM)
- [RansomLook](https://www.ransomlook.io/) — Ransomware leak-site monitoring API
- [Robin](https://github.com/) — Dark-web search methodology inspiration
- [Z.AI](https://z.ai) — Default AI provider

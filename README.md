# CARTINT - Automotive Threat Intelligence Dashboard

CARTINT is a local-first automotive cyber threat intelligence dashboard built with Next.js, Prisma, SQLite, Socket.IO, and Bun. It aggregates public OSINT and dark-web-adjacent sources, filters threats for automotive relevance, maps accepted items to the Auto-ISAC Automotive Threat Matrix, and generates CTI reports.

The project is designed to work from a fresh `git clone` on any machine. Runtime paths are relative to the cloned repository, and AI features degrade gracefully if no AI provider is configured.

## What It Does

- Tracks automotive-relevant ransomware, breach, CVE, and dark-web OSINT items.
- Classifies scraped items with an AI provider when configured.
- Falls back to deterministic keyword heuristics when AI is not configured or unavailable.
- Maps threats to automotive categories and Auto-ISAC ATM tactics/techniques.
- Stores data locally in SQLite through Prisma.
- Provides real-time dashboard updates through a local Socket.IO mini-service.
- Provides scheduled scraping and health checks through a local watchdog mini-service.
- Supports optional Tor SOCKS5 access for `.onion` scraping.

## Tech Stack

| Area | Technology |
|---|---|
| Dashboard | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn-style components |
| Database | Prisma ORM, SQLite |
| Runtime/package manager | Bun |
| Realtime | Socket.IO mini-service on port `3003` |
| Scheduler/watchdog | Bun mini-service on port `3004` |
| Charts/UI | Recharts, Framer Motion, Lucide icons |
| AI integration | OpenAI-compatible HTTP API layer |

## Services And Ports

Run the dashboard first. The dashboard can auto-start the mini-services through the System Status API, but starting them manually is also supported.

| Service | Port | Required? | Purpose |
|---|---:|---|---|
| Next.js dashboard | `3000` | Yes | Web UI and API routes |
| threat-feed-service | `3003` | Recommended | Socket.IO live threat update broadcasts |
| watchdog-scheduler | `3004` | Recommended | Scheduled scrapes and dashboard health checks |
| Ollama | `11434` | Optional | Local AI provider if you use Ollama |
| Tor SOCKS5 | `9050` | Optional | `.onion` access for dark-web scraping |

## Prerequisites

Install these before setup:

- Git.
- Bun `1.x` or newer.
- Node-compatible shell environment. Linux and macOS work best; Windows users should use WSL2.
- Optional: Tor, if you want direct `.onion` scraping.
- Optional: Ollama or an API key for an AI provider.

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Restart your shell after installing Bun if `bun --version` is not found.

## Quick Start

```bash
git clone https://github.com/reuelmagistrado/cartint-dashboard.git
cd cartint-dashboard
bun run setup
bun run dev
```

Open `http://localhost:3000`.

After the page loads, use the Intelligence Sources panel to run a scrape. The database starts local to your clone at `db/custom.db`.

## Fresh Clone Setup In Detail

1. Clone the repository:

```bash
git clone https://github.com/reuelmagistrado/cartint-dashboard.git
cd cartint-dashboard
```

2. Install dependencies and initialize SQLite:

```bash
bun run setup
```

This runs `bun install`, creates `db/` if needed, creates a relative `.env` if missing, and runs `prisma db push`.

3. Start the dashboard:

```bash
bun run dev
```

4. Start mini-services if they are not auto-started by the dashboard:

```bash
bash mini-services/start-services.sh
```

5. Open the dashboard:

```text
http://localhost:3000
```

6. Trigger data collection from the dashboard with `Scrape All` or configure per-source schedules.

## Environment Configuration

The default `.env` uses a relative SQLite path so the project works from any clone location:

```bash
DATABASE_URL=file:./db/custom.db
```

Common optional variables:

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
AI_API_KEY=

TOR_SOCKS_HOST=127.0.0.1
TOR_SOCKS_PORT=9050

RANSOMLOOK_API_URL=https://www.ransomlook.io/api
MAX_DOWNLOAD_BYTES=1000000
MAX_EXTRACTED_TEXT=50000
MAX_RETURN_CHARS=2000
SCRAPE_TIMEOUT_TOR=45
SCRAPE_MAX_WORKERS=5
```

Do not use an absolute `DATABASE_URL` unless you intentionally want the database outside the repository.

## AI Setup

AI is optional. Without AI, CARTINT still runs and uses deterministic fallbacks for classification, report generation, IOC extraction, filtering, and ATM mapping.

The AI integration uses OpenAI-compatible `/chat/completions` HTTP calls. No vendor SDK is required.

### Option A: Ollama Local AI

Install Ollama from `https://ollama.com/download`, then run:

```bash
ollama pull llama3.2
```

Add this to `.env`:

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
```

Make sure Ollama is running before generating AI reports or using AI classification.

### Option B: OpenAI

```bash
AI_PROVIDER=openai
AI_API_KEY=your-openai-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o
```

### Option C: Google Gemini OpenAI-Compatible Endpoint

```bash
AI_PROVIDER=google
AI_API_KEY=your-google-api-key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.0-flash
```

### Option D: Anthropic OpenAI-Compatible Endpoint

```bash
AI_PROVIDER=anthropic
AI_API_KEY=your-anthropic-api-key
AI_BASE_URL=https://api.anthropic.com/v1
AI_MODEL=claude-sonnet-4-20250514
```

### Option E: Custom OpenAI-Compatible Provider

Use this for LM Studio, vLLM, Together AI, Azure-compatible gateways, or any provider exposing `/chat/completions`:

```bash
AI_PROVIDER=custom
AI_API_KEY=your-api-key-if-required
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-model-id
```

The Base URL must point to the AI API server, not the CARTINT dashboard. Do not use `http://localhost:3000`. For OpenAI-compatible providers, use the `/v1` base URL, not the full `/chat/completions` URL.

You can also configure AI at runtime from the dashboard in the CTI Reports tab through the AI Provider Settings panel. Runtime settings are in memory and are not written to `.env`.

Settings saved through the dashboard are persisted locally in `db/ai-settings.json`. This file is ignored by Git because it may contain an API key. Custom OpenAI-compatible providers can be used without an API key when the local endpoint does not require one, such as LM Studio, Ollama-compatible gateways, or some vLLM deployments.

## Tor Setup Optional

Tor is only needed for direct `.onion` scraping. Clearnet sources such as RansomLook, BleepingComputer, The Hacker News, and NVD do not require Tor.

Linux:

```bash
sudo apt update
sudo apt install tor
sudo service tor start
```

macOS:

```bash
brew install tor
tor
```

Verify Tor:

```bash
curl --socks5-hostname 127.0.0.1:9050 https://check.torproject.org/api/ip
```

Expected result includes `"IsTor":true`.

## Running The App

Development dashboard only:

```bash
bun run dev
```

Development dashboard plus mini-services:

```bash
bun run dev
bash mini-services/start-services.sh
```

Production build:

```bash
bun run build
bun run start
```

`bun run start` forces Prisma to use `db/custom.db` in the repository root, even though the compiled Next.js server runs from `.next/standalone`. It also runs `prisma db push` before starting so a fresh production database has the required schema.

Useful checks:

```bash
bun run lint
bunx tsc --noEmit
```

## Mini-Services

The `mini-services` folder contains independent Bun services.

`threat-feed-service` runs on port `3003` and exposes:

- `GET /health`
- `POST /notify`
- Socket.IO at the default `/socket.io/` path

`watchdog-scheduler` runs on port `3004` and exposes:

- `GET /health`

The dashboard calls `/api/system-status`, which pings both services and attempts to start them with `mini-services/start-services.sh` if they are down. The startup script resolves its own directory dynamically, so it does not depend on the clone path.

## Data Sources

| Source | Requires Tor? | Notes |
|---|---|---|
| RansomLook | No | Ransomware leak monitoring through clearnet API |
| BleepingComputer | No | Security RSS/news source |
| The Hacker News | No | Security RSS/news source |
| NVD CVE | No | CVE data filtered for automotive terms |
| Ahmia/dark-web search | Optional | Better coverage when Tor is available |
| Curated dark-forum intelligence | Optional | Analyst-oriented source adapter |

## Project Structure

```text
src/app/                      Next.js app and API routes
src/components/dashboard/     Dashboard panels and UI components
src/lib/ai-provider.ts        OpenAI-compatible AI provider layer
src/lib/scraper/              Source adapters, classifier, Tor helpers, ATM mapping
src/lib/db.ts                 Prisma client singleton
prisma/schema.prisma          SQLite schema
db/custom.db                  Local SQLite database
mini-services/                Local Bun services for realtime and scheduling
setup.sh                      Clone setup helper
```

## Troubleshooting

If `bun` is not found, install Bun and restart your shell.

If Prisma fails with `DATABASE_URL` errors, ensure `.env` contains:

```bash
DATABASE_URL=file:./db/custom.db
```

If the System Status panel shows mini-services down, run:

```bash
bash mini-services/start-services.sh
```

If port `3000`, `3003`, or `3004` is already in use, stop the process using that port or change the service code/config before starting.

If AI reports fail, either configure an AI provider or use fallback mode. The app should continue to run without AI.

If `.onion` scraping fails, verify Tor is installed and listening on `127.0.0.1:9050`.

## Portability Notes

- No runtime code should require the original generation environment or any other absolute project path.
- SQLite defaults to `file:./db/custom.db`, relative to the cloned project.
- Mini-service scripts resolve paths from their own location.
- The AI layer uses standard OpenAI-compatible HTTP requests and does not require a vendor-specific SDK.
- `.env` is ignored by Git, but the setup script creates a safe local one if missing.

## License

MIT

## Acknowledgments

- Auto-ISAC Automotive Threat Matrix.
- RansomLook ransomware leak-site monitoring API.
- Public security reporting and CVE data sources used by the source adapters.

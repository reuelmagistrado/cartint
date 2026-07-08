// CARTINT Watchdog + Scheduler mini-service (port 3004).
//
// Two responsibilities:
//   1. HEALTH WATCHDOG: pings the Next.js dev server (/api/stats) every 30s.
//      If it fails 3 consecutive checks, restarts the dev server
//      (`bun run dev` in the project root) and logs the restart.
//      Prevents the blank-page bug seen when the dev server crashes.
//
//   2. SCHEDULED SCRAPES: every 60s, queries /api/sources/config for each
//      source's scrapeIntervalMin. If a source is enabled + has an interval > 0
//      AND enough time has passed since its lastFetchAt, POSTs /api/scrape
//      with { source } to run that source. Makes the schedule panel functional.
//
// Exposes a /health endpoint (port 3004) for observability.

import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const PORT = 3004;
// Resolve project root from this file's location (works on any machine)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const NEXT_URL = process.env.NEXT_URL || "http://localhost:3000";
const HEALTH_INTERVAL_MS = 30_000;
const SCHEDULE_INTERVAL_MS = 60_000;
const MAX_FAILS = 3;

const state = {
  healthChecks: 0,
  healthFails: 0,
  lastHealthOk: null as Date | null,
  restarts: 0,
  lastRestart: null as Date | null,
  scheduledScrapes: 0,
  lastScheduledScrape: null as Date | null,
  startedAt: new Date(),
};

// --- Health watchdog --------------------------------------------------------

async function pingNext(): Promise<boolean> {
  try {
    const res = await fetch(`${NEXT_URL}/api/stats?trendDays=1`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function restartNext() {
  console.log(`[watchdog] 🔄 restarting Next.js dev server (fail streak: ${state.healthFails})…`);
  try {
    // Kill any existing next dev process.
    const proc = Bun.spawn(["pkill", "-f", "next dev"], { cwd: PROJECT_ROOT });
    await proc.exited;
  } catch {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 2000));
  // Start fresh in the background. Output goes to the project dev.log (appended).
  try {
    Bun.spawn(["bash", "-c", "bun run dev >> dev.log 2>&1"], { cwd: PROJECT_ROOT });
  } catch (e) {
    console.error("[watchdog] restart spawn failed:", e);
    return;
  }
  state.restarts++;
  state.lastRestart = new Date();
  state.healthFails = 0;
  console.log("[watchdog] ✓ dev server restart initiated");
}

async function healthCheck() {
  state.healthChecks++;
  const ok = await pingNext();
  if (ok) {
    state.healthFails = 0;
    state.lastHealthOk = new Date();
  } else {
    state.healthFails++;
    console.warn(`[watchdog] ⚠ health check failed (${state.healthFails}/${MAX_FAILS})`);
    if (state.healthFails >= MAX_FAILS) {
      await restartNext();
    }
  }
}

// --- Scheduled scrapes ------------------------------------------------------

type SourceConfig = {
  name: string;
  enabled: boolean;
  scrapeIntervalMin: number;
  lastFetchAt: string | null;
};

async function fetchSources(): Promise<SourceConfig[]> {
  try {
    const res = await fetch(`${NEXT_URL}/api/sources/config`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { sources?: SourceConfig[] };
    return json.sources ?? [];
  } catch {
    return [];
  }
}

async function triggerScrape(source: string): Promise<boolean> {
  try {
    const res = await fetch(`${NEXT_URL}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
      signal: AbortSignal.timeout(180_000),
    });
    return res.ok;
  } catch (e) {
    console.warn(`[scheduler] scrape of ${source} failed:`, (e as Error).message);
    return false;
  }
}

async function runScheduledScrapes() {
  const sources = await fetchSources();
  if (sources.length === 0) return;
  const now = Date.now();
  for (const s of sources) {
    if (!s.enabled || s.scrapeIntervalMin <= 0) continue;
    const intervalMs = s.scrapeIntervalMin * 60_000;
    const lastMs = s.lastFetchAt ? new Date(s.lastFetchAt).getTime() : 0;
    if (now - lastMs >= intervalMs) {
      console.log(`[scheduler] ⏰ scheduled scrape: ${s.name} (interval ${s.scrapeIntervalMin}m, last ${s.lastFetchAt ?? "never"})`);
      const ok = await triggerScrape(s.name);
      if (ok) {
        state.scheduledScrapes++;
        state.lastScheduledScrape = new Date();
        console.log(`[scheduler] ✓ ${s.name} scrape completed`);
      }
    }
  }
}

// --- HTTP /health endpoint --------------------------------------------------

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        ...state,
        lastHealthOk: state.lastHealthOk?.toISOString() ?? null,
        lastRestart: state.lastRestart?.toISOString() ?? null,
        lastScheduledScrape: state.lastScheduledScrape?.toISOString() ?? null,
        startedAt: state.startedAt.toISOString(),
        uptime: Math.floor((Date.now() - state.startedAt.getTime()) / 1000),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

httpServer.listen(PORT, () => {
  console.log(`[watchdog-scheduler] listening on port ${PORT}`);
  console.log(`[watchdog-scheduler] health checks every ${HEALTH_INTERVAL_MS / 1000}s, schedules every ${SCHEDULE_INTERVAL_MS / 1000}s`);
  console.log(`[watchdog-scheduler] target: ${NEXT_URL}`);
  // Run an immediate health check + schedule pass on startup.
  setTimeout(healthCheck, 2000);
  setTimeout(runScheduledScrapes, 5000);
});

setInterval(healthCheck, HEALTH_INTERVAL_MS);
setInterval(runScheduledScrapes, SCHEDULE_INTERVAL_MS);

console.log(`[watchdog-scheduler] started at ${state.startedAt.toISOString()}`);

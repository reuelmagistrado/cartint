import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

type ServiceHealth = {
  name: string;
  status: "ok" | "down" | "degraded";
  url: string;
  port: number;
  uptime?: number;
  lastCheck: string;
  details?: Record<string, unknown>;
  error?: string;
  autoStarted?: boolean;
};

// Self-healing: if a mini-service is down, start it. Uses child_process.spawn
// with detached:true + stdio ignore so the child survives the request lifecycle.
// The Next.js server process is persistent, so its spawned children persist too.
let startAttemptedAt: Record<number, number> = {}; // port -> last attempt timestamp (ms)
const START_COOLDOWN_MS = 30_000; // don't retry starting more than once per 30s

function tryStartService(port: number): boolean {
  const now = Date.now();
  if (startAttemptedAt[port] && now - startAttemptedAt[port] < START_COOLDOWN_MS) {
    return false; // on cooldown — recently attempted
  }
  startAttemptedAt[port] = now;
  try {
    const child = spawn(
      "bash",
      ["/home/z/my-project/mini-services/start-services.sh"],
      {
        detached: true,
        stdio: "ignore",
        cwd: "/home/z/my-project/mini-services",
      },
    );
    child.unref(); // allow the parent (Next.js) to exit independently
    console.log(`[system-status] auto-start attempted for port ${port} (pid ${child.pid})`);
    return true;
  } catch (e) {
    console.error(`[system-status] auto-start failed for port ${port}:`, e);
    return false;
  }
}

// GET /api/system-status — aggregates health from all CARTINT services into a
// single response for the System Status panel:
//   1. Next.js dev server (this app, port 3000)
//   2. threat-feed-service (WebSocket, port 3003)
//   3. watchdog-scheduler (health watchdog + scrape scheduler, port 3004)
//
// Self-healing: if a mini-service is down, the endpoint attempts to start it
// via the start-services.sh script. The status reflects the pre-start state
// (the service needs a few seconds to come up); the next poll will show "ok".
export async function GET() {
  await ensureSourcesSeeded();

  const now = new Date().toISOString();

  // 1. Next.js dev server — we're running inside it, so it's up. Add DB stats.
  let dbOk = true;
  let threatCount = 0;
  let sourceCount = 0;
  try {
    [threatCount, sourceCount] = await Promise.all([
      db.threat.count({ where: { isAutomotive: true, relevanceScore: { gte: 70 } } }),
      db.source.count(),
    ]);
  } catch {
    dbOk = false;
  }

  const nextjs: ServiceHealth = {
    name: "Next.js Dashboard",
    status: dbOk ? "ok" : "degraded",
    url: "http://localhost:3000",
    port: 3000,
    lastCheck: now,
    details: {
      threats: threatCount,
      sources: sourceCount,
      db: dbOk ? "connected" : "error",
    },
  };

  // 2. threat-feed-service (port 3003) — with auto-start
  const threatFeed = await pingServiceWithAutoStart("threat-feed-service", "http://localhost:3003/health", 3003, now);

  // 3. watchdog-scheduler (port 3004) — with auto-start
  const watchdog = await pingServiceWithAutoStart("watchdog-scheduler", "http://localhost:3004/health", 3004, now);

  const services = [nextjs, threatFeed, watchdog];
  const allOk = services.every((s) => s.status === "ok");
  const anyDown = services.some((s) => s.status === "down");

  return NextResponse.json({
    ok: allOk,
    status: allOk ? "operational" : anyDown ? "degraded" : "partial",
    services,
    checkedAt: now,
  });
}

async function pingServiceWithAutoStart(
  name: string,
  url: string,
  port: number,
  now: string,
): Promise<ServiceHealth> {
  // First, try to ping
  const result = await pingService(name, url, port, now);

  // If down, attempt auto-start (with cooldown)
  if (result.status === "down") {
    const started = tryStartService(port);
    if (started) {
      // Wait a moment for the service to come up, then re-ping
      await new Promise((r) => setTimeout(r, 3000));
      const reResult = await pingService(name, url, port, now);
      if (reResult.status === "ok") {
        return { ...reResult, autoStarted: true };
      }
      // Still down after re-ping — return the original with a note
      return { ...result, error: `${result.error} (auto-start attempted)` };
    }
  }
  return result;
}

async function pingService(
  name: string,
  url: string,
  port: number,
  now: string,
): Promise<ServiceHealth> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      return { name, status: "down", url, port, lastCheck: now, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      name,
      status: "ok",
      url,
      port,
      lastCheck: now,
      uptime: typeof data.uptime === "number" ? data.uptime : undefined,
      details: data,
    };
  } catch (e) {
    return { name, status: "down", url, port, lastCheck: now, error: (e as Error).message };
  }
}

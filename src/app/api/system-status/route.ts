import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

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
};

// GET /api/system-status — aggregates health from all CARTINT services into a
// single response for the System Status panel:
//   1. Next.js dev server (this app, port 3000)
//   2. threat-feed-service (WebSocket, port 3003)
//   3. watchdog-scheduler (health watchdog + scrape scheduler, port 3004)
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();

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

  // 2. threat-feed-service (port 3003)
  const threatFeed = await pingService("threat-feed-service", "http://localhost:3003/health", 3003, now);

  // 3. watchdog-scheduler (port 3004)
  const watchdog = await pingService("watchdog-scheduler", "http://localhost:3004/health", 3004, now);

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

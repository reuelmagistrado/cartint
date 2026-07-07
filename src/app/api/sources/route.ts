import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/sources — source status overview.
export async function GET() {
  await ensureSourcesSeeded();

  const sources = await db.source.findMany({
    orderBy: [{ isDarkWeb: "desc" }, { name: "asc" }],
  });

  const lastLogs = await db.scrapeLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 60,
  });
  const latestBySource = new Map<string, (typeof lastLogs)[number]>();
  for (const log of lastLogs) {
    if (!latestBySource.has(log.sourceName)) latestBySource.set(log.sourceName, log);
  }

  return NextResponse.json({
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      url: s.url,
      description: s.description,
      enabled: s.enabled,
      isDarkWeb: s.isDarkWeb,
      lastFetchAt: s.lastFetchAt,
      lastStatus: s.lastStatus,
      lastError: s.lastError,
      threatCount: s.threatCount,
      lastRun: latestBySource.get(s.name) ?? null,
    })),
  });
}

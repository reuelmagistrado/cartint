import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";

// GET /api/scrape-history — per-run scrape stats over time (last 60 runs).
// Returns an ordered timeline of { startedAt, sourceName, status, fetched,
// accepted, rejected } plus a cumulative false-positive-rejection rate trend
// used by the ScrapeHistoryChart.
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();

  const logs = await db.scrapeLog.findMany({
    orderBy: { startedAt: "asc" },
    take: 60,
    select: {
      id: true,
      sourceName: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      fetched: true,
      accepted: true,
      rejected: true,
    },
  });

  // Build a cumulative FP-rate trend (running rejected / running fetched).
  let cumFetched = 0;
  let cumRejected = 0;
  const timeline = logs.map((l) => {
    cumFetched += l.fetched;
    cumRejected += l.rejected;
    const cumRate = cumFetched > 0 ? Math.round((cumRejected / cumFetched) * 100) : 0;
    const runRate = l.fetched > 0 ? Math.round((l.rejected / l.fetched) * 100) : 0;
    return {
      id: l.id,
      startedAt: l.startedAt.toISOString(),
      sourceName: l.sourceName,
      status: l.status,
      fetched: l.fetched,
      accepted: l.accepted,
      rejected: l.rejected,
      runRate,
      cumRate,
    };
  });

  // Aggregate by source for the summary.
  const bySource = new Map<string, { fetched: number; accepted: number; rejected: number; runs: number }>();
  for (const l of logs) {
    const cur = bySource.get(l.sourceName) ?? { fetched: 0, accepted: 0, rejected: 0, runs: 0 };
    cur.fetched += l.fetched;
    cur.accepted += l.accepted;
    cur.rejected += l.rejected;
    cur.runs += 1;
    bySource.set(l.sourceName, cur);
  }

  return NextResponse.json({
    timeline,
    bySource: [...bySource.entries()]
      .map(([name, v]) => ({ name, ...v, rate: v.fetched > 0 ? Math.round((v.rejected / v.fetched) * 100) : 0 }))
      .sort((a, b) => b.fetched - a.fetched),
    totals: {
      runs: logs.length,
      fetched: cumFetched,
      accepted: logs.reduce((s, l) => s + l.accepted, 0),
      rejected: cumRejected,
      cumRate: cumFetched > 0 ? Math.round((cumRejected / cumFetched) * 100) : 0,
    },
  });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard KPIs and chart data.
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();

  const accepted = {
    isAutomotive: true,
    relevanceScore: { gte: RELEVANCE_THRESHOLD },
  };
  const rejected = {
    OR: [{ isAutomotive: false }, { relevanceScore: { lt: RELEVANCE_THRESHOLD } }],
  };

  const [
    totalThreats,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    rejectedCount,
    sourcesCount,
    darkWebSourcesCount,
    verifiedCount,
    recentScrapes,
  ] = await Promise.all([
    db.threat.count({ where: accepted }),
    db.threat.count({ where: { ...accepted, severity: "critical" } }),
    db.threat.count({ where: { ...accepted, severity: "high" } }),
    db.threat.count({ where: { ...accepted, severity: "medium" } }),
    db.threat.count({ where: { ...accepted, severity: "low" } }),
    db.threat.count({ where: rejected }),
    db.source.count(),
    db.source.count({ where: { isDarkWeb: true } }),
    db.threat.count({ where: { ...accepted, verified: true } }),
    db.scrapeLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  // Threats by source (accepted).
  const bySourceRaw = await db.threat.groupBy({
    by: ["sourceName"],
    where: accepted,
    _count: { _all: true },
  });

  // Threats by automotive category.
  const byCategoryRaw = await db.threat.groupBy({
    by: ["automotiveCategory"],
    where: accepted,
    _count: { _all: true },
  });

  // Threats by ATM tactic.
  const byTacticRaw = await db.threat.groupBy({
    by: ["atmTactic"],
    where: accepted,
    _count: { _all: true },
  });

  // Threats by country (top 10).
  const byCountryRaw = await db.threat.groupBy({
    by: ["country"],
    where: { ...accepted, country: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { country: "desc" } },
    take: 10,
  });

  // Threats by actor (top 8).
  const byActorRaw = await db.threat.groupBy({
    by: ["actor"],
    where: { ...accepted, actor: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { actor: "desc" } },
    take: 8,
  });

  // Threats over time — last 14 days.
  const since = new Date(Date.now() - 14 * 86400000);
  const recentThreats = await db.threat.findMany({
    where: { ...accepted, attackDate: { gte: since } },
    select: { attackDate: true, severity: true },
  });
  const trend: { date: string; critical: number; high: number; medium: number; low: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, critical: 0, high: 0, medium: 0, low: 0 });
  }
  for (const t of recentThreats) {
    if (!t.attackDate) continue;
    const key = t.attackDate.toISOString().slice(0, 10);
    const bucket = trend.find((b) => b.date === key);
    if (bucket) bucket[t.severity as "critical" | "high" | "medium" | "low"]++;
  }

  // False-positive rejection rate (last scrape logs).
  const scrapeStats = await db.scrapeLog.aggregate({
    _sum: { fetched: true, accepted: true, rejected: true },
  });
  const totalFetched = scrapeStats._sum.fetched ?? 0;
  const totalRejected = scrapeStats._sum.rejected ?? 0;
  const falsePositiveRate = totalFetched > 0 ? Math.round((totalRejected / totalFetched) * 100) : 0;

  return NextResponse.json({
    totalThreats,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    rejectedCount,
    sourcesCount,
    darkWebSourcesCount,
    verifiedCount,
    falsePositiveRate,
    totalScraped: totalFetched,
    totalRejected,
    bySource: bySourceRaw.map((s) => ({ name: s.sourceName, count: s._count._all })),
    byCategory: byCategoryRaw
      .map((c) => ({ name: c.automotiveCategory ?? "Unknown", count: c._count._all }))
      .sort((a, b) => b.count - a.count),
    byTactic: byTacticRaw
      .map((t) => ({ name: t.atmTactic ?? "Unknown", count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    byCountry: byCountryRaw.map((c) => ({ name: c.country ?? "Unknown", count: c._count._all })),
    byActor: byActorRaw
      .map((a) => ({ name: a.actor ?? "Unknown", count: a._count._all }))
      .sort((a, b) => b.count - a.count),
    trend,
    recentScrapes: recentScrapes.map((s) => ({
      sourceName: s.sourceName,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      status: s.status,
      fetched: s.fetched,
      accepted: s.accepted,
      rejected: s.rejected,
      error: s.error,
    })),
  });
}

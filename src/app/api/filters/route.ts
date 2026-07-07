import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ATM_TACTICS } from "@/lib/atm";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/filters — distinct values for dashboard filter dropdowns.
export async function GET() {
  await ensureSourcesSeeded();

  const accepted = { isAutomotive: true, relevanceScore: { gte: RELEVANCE_THRESHOLD } };

  const [sources, categories, countries, actors, severities] = await Promise.all([
    db.source.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.threat.groupBy({ by: ["automotiveCategory"], where: accepted, _count: { _all: true } }),
    db.threat.groupBy({ by: ["country"], where: { ...accepted, country: { not: null } }, _count: { _all: true } }),
    db.threat.groupBy({ by: ["actor"], where: { ...accepted, actor: { not: null } }, _count: { _all: true } }),
    db.threat.groupBy({ by: ["severity"], where: accepted, _count: { _all: true } }),
  ]);

  return NextResponse.json({
    sources: sources.map((s) => s.name),
    tactics: ATM_TACTICS.map((t) => t.name),
    categories: categories
      .map((c) => c.automotiveCategory ?? "Unknown")
      .filter(Boolean)
      .sort(),
    countries: countries
      .map((c) => c.country ?? "Unknown")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    actors: actors
      .map((a) => a.actor ?? "Unknown")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    severities: severities.map((s) => ({ name: s.severity, count: s._count._all })),
  });
}

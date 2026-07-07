import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/actors/[name] — threat-actor profile.
// Returns all accepted threats attributed to this actor, plus aggregate stats
// (severity breakdown, targeted victims, countries, categories, ATM tactics,
// source distribution, first/last seen).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  await ensureSourcesSeeded();

  const { name } = await params;
  const actorName = decodeURIComponent(name);

  const threats = await db.threat.findMany({
    where: {
      actor: actorName,
      isAutomotive: true,
      relevanceScore: { gte: 70 },
    },
    orderBy: [{ attackDate: "desc" }, { relevanceScore: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      severity: true,
      sourceName: true,
      sourceType: true,
      automotiveCategory: true,
      atmTactic: true,
      atmTechnique: true,
      victimOrg: true,
      country: true,
      attackDate: true,
      relevanceScore: true,
      dataTypes: true,
    },
  });

  if (threats.length === 0) {
    return NextResponse.json({ error: "No threats found for this actor", actor: actorName }, { status: 404 });
  }

  // Aggregates.
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byTactic = new Map<string, number>();
  const bySource = new Map<string, number>();
  const victims = new Set<string>();
  const dataTypesSet = new Set<string>();
  const dates: Date[] = [];

  for (const t of threats) {
    bySeverity[t.severity as keyof typeof bySeverity]++;
    if (t.automotiveCategory) byCategory.set(t.automotiveCategory, (byCategory.get(t.automotiveCategory) ?? 0) + 1);
    if (t.country) byCountry.set(t.country, (byCountry.get(t.country) ?? 0) + 1);
    if (t.atmTactic) byTactic.set(t.atmTactic, (byTactic.get(t.atmTactic) ?? 0) + 1);
    bySource.set(t.sourceName, (bySource.get(t.sourceName) ?? 0) + 1);
    if (t.victimOrg) victims.add(t.victimOrg);
    if (t.dataTypes) t.dataTypes.split(",").forEach((d) => dataTypesSet.add(d.trim()));
    if (t.attackDate) dates.push(new Date(t.attackDate));
  }

  dates.sort((a, b) => a.getTime() - b.getTime());
  const firstSeen = dates.length > 0 ? dates[0].toISOString() : null;
  const lastSeen = dates.length > 0 ? dates[dates.length - 1].toISOString() : null;

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  return NextResponse.json({
    actor: actorName,
    totalThreats: threats.length,
    bySeverity,
    byCategory: top(byCategory, 8).map(([name, count]) => ({ name, count })),
    byCountry: top(byCountry, 10).map(([name, count]) => ({ name, count })),
    byTactic: top(byTactic, 11).map(([name, count]) => ({ name, count })),
    bySource: top(bySource, 6).map(([name, count]) => ({ name, count })),
    victims: [...victims].slice(0, 20),
    dataTypes: [...dataTypesSet].slice(0, 15),
    firstSeen,
    lastSeen,
    threats: threats.slice(0, 30),
  });
}

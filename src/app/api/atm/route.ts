import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ATM_TACTICS } from "@/lib/atm";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";

// GET /api/atm — Auto-ISAC Automotive Threat Matrix heatmap.
// Returns counts of accepted threats per tactic (and per technique).
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();

  const accepted = { isAutomotive: true, relevanceScore: { gte: RELEVANCE_THRESHOLD } };

  const byTactic = await db.threat.groupBy({
    by: ["atmTactic"],
    where: accepted,
    _count: { _all: true },
  });
  const byTechnique = await db.threat.groupBy({
    by: ["atmTechnique"],
    where: accepted,
    _count: { _all: true },
  });

  const tacticCount = new Map<string, number>();
  for (const t of byTactic) if (t.atmTactic) tacticCount.set(t.atmTactic, t._count._all);
  const techniqueCount = new Map<string, number>();
  for (const t of byTechnique) if (t.atmTechnique) techniqueCount.set(t.atmTechnique, t._count._all);

  const tactics = ATM_TACTICS.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    count: tacticCount.get(t.name) ?? 0,
    techniques: t.techniques.map((tech) => ({
      id: tech.id,
      name: tech.name,
      description: tech.description,
      count: techniqueCount.get(tech.name) ?? 0,
    })),
  }));

  const maxCount = Math.max(1, ...tactics.map((t) => t.count));

  return NextResponse.json({ tactics, maxCount });
}

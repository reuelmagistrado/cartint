import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";

// GET /api/threats/[id]/related — threats related to the given threat
// (same actor, automotive category, country, or ATM tactic), excluding itself.
// Used by the threat detail dialog's "Related Threats" section.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSourcesSeeded();
  await seedIfEmpty();

  const { id } = await params;
  const threat = await db.threat.findUnique({ where: { id } });
  if (!threat) {
    return NextResponse.json({ error: "Threat not found" }, { status: 404 });
  }

  // Build OR conditions for relatedness. Only include fields that are set.
  const or: Record<string, unknown>[] = [];
  if (threat.actor) or.push({ actor: threat.actor });
  if (threat.automotiveCategory) or.push({ automotiveCategory: threat.automotiveCategory });
  if (threat.country) or.push({ country: threat.country });
  if (threat.atmTactic) or.push({ atmTactic: threat.atmTactic });
  if (threat.sourceName) or.push({ sourceName: threat.sourceName });

  if (or.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const related = await db.threat.findMany({
    where: {
      id: { not: threat.id },
      isAutomotive: true,
      relevanceScore: { gte: 70 },
      OR: or,
    },
    orderBy: [{ relevanceScore: "desc" }, { attackDate: "desc" }],
    take: 8,
    select: {
      id: true,
      title: true,
      severity: true,
      sourceName: true,
      automotiveCategory: true,
      atmTactic: true,
      actor: true,
      country: true,
      attackDate: true,
      relevanceScore: true,
    },
  });

  // Score each related threat by how many fields match (for sorting/display).
  const scored = related.map((r) => {
    let matches = 0;
    const reasons: string[] = [];
    if (threat.actor && r.actor === threat.actor) { matches += 3; reasons.push("same actor"); }
    if (threat.automotiveCategory && r.automotiveCategory === threat.automotiveCategory) { matches += 2; reasons.push("same category"); }
    if (threat.country && r.country === threat.country) { matches += 1; reasons.push("same country"); }
    if (threat.atmTactic && r.atmTactic === threat.atmTactic) { matches += 2; reasons.push("same ATM tactic"); }
    if (threat.sourceName && r.sourceName === threat.sourceName) { matches += 1; reasons.push("same source"); }
    return { ...r, matchScore: matches, reasons };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore || b.relevanceScore - a.relevanceScore);

  return NextResponse.json({ items: scored });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/threats — list automotive threats with filters.
export async function GET(req: NextRequest) {
  await ensureSourcesSeeded();

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 100), 500);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);
  const source = sp.get("source");
  const severity = sp.get("severity");
  const category = sp.get("category");
  const tactic = sp.get("tactic");
  const country = sp.get("country");
  const actor = sp.get("actor");
  const search = sp.get("search");
  const minScore = Number(sp.get("minScore") ?? RELEVANCE_THRESHOLD);
  const includeRejected = sp.get("includeRejected") === "1";
  const watchlistIds = sp.get("watchlist");

  const where: Record<string, unknown> = {};
  if (!includeRejected) {
    where.isAutomotive = true;
    where.relevanceScore = { gte: minScore };
  } else {
    if (sp.get("rejectedOnly") === "1") {
      where.OR = [
        { isAutomotive: false },
        { relevanceScore: { lt: RELEVANCE_THRESHOLD } },
      ];
    }
  }
  if (watchlistIds) {
    const ids = watchlistIds.split(",").filter(Boolean);
    where.id = { in: ids.length > 0 ? ids : ["__none__"] };
  }
  if (source && source !== "all") where.sourceName = source;
  if (severity && severity !== "all") where.severity = severity;
  if (category && category !== "all") where.automotiveCategory = category;
  if (tactic && tactic !== "all") where.atmTactic = tactic;
  if (country && country !== "all") where.country = country;
  if (actor && actor !== "all") where.actor = actor;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { victimOrg: { contains: search } },
      { actor: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    db.threat.findMany({
      where,
      orderBy: [{ attackDate: "desc" }, { relevanceScore: "desc" }],
      take: limit,
      skip: offset,
    }),
    db.threat.count({ where }),
  ]);

  return NextResponse.json({ items, total, limit, offset });
}

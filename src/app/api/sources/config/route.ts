import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/sources/config — source config (enabled + scrapeIntervalMin).
export async function GET() {
  await ensureSourcesSeeded();
  const sources = await db.source.findMany({
    orderBy: [{ isDarkWeb: "desc" }, { name: "asc" }],
    select: { id: true, name: true, enabled: true, scrapeIntervalMin: true, isDarkWeb: true },
  });
  return NextResponse.json({ sources });
}

// POST /api/sources/config — update source configs.
// Body: { sources: [{ name, enabled, scrapeIntervalMin }] }
// Only enabled + scrapeIntervalMin are editable.
export async function POST(req: NextRequest) {
  await ensureSourcesSeeded();
  try {
    const body = await req.json().catch(() => ({}));
    const updates = Array.isArray(body?.sources) ? body.sources : [];
    let updated = 0;
    for (const u of updates) {
      if (!u || typeof u.name !== "string") continue;
      const data: { enabled?: boolean; scrapeIntervalMin?: number } = {};
      if (typeof u.enabled === "boolean") data.enabled = u.enabled;
      if (typeof u.scrapeIntervalMin === "number") {
        data.scrapeIntervalMin = Math.max(0, Math.min(1440, Math.round(u.scrapeIntervalMin)));
      }
      if (Object.keys(data).length === 0) continue;
      try {
        await db.source.update({ where: { name: u.name }, data });
        updated++;
      } catch {
        // source may not exist — skip
      }
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

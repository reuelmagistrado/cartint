import { NextRequest, NextResponse } from "next/server";
import { ensureSourcesSeeded, scrapeAll, scrapeSource, notifyThreatStream } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — darkweb scrape + LLM classification can take a while

// POST /api/scrape — trigger a dark-web OSINT scrape.
// Body: { source?: string }  — if source is provided, scrape only that source.
export async function POST(req: NextRequest) {
  await ensureSourcesSeeded();
  await seedIfEmpty();
  try {
    const body = await req.json().catch(() => ({}));
    const source = typeof body?.source === "string" ? body.source : undefined;

    const results = source ? [await scrapeSource(source)] : await scrapeAll();
    // For single-source scrapes, notify the WS service here (scrapeAll already
    // notifies itself). Best-effort, non-blocking.
    if (source) {
      notifyThreatStream({ results, source }).catch(() => {});
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

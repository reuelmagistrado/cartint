import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";

export const dynamic = "force-dynamic";

// GET /api/scrapelogs — recent scrape run history (for the false-positive audit panel).
export async function GET() {
  await ensureSourcesSeeded();
  const logs = await db.scrapeLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ logs });
}

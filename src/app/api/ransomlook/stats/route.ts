import { NextResponse } from "next/server";
import { getStats } from "@/lib/scraper/ransomlook";

export const dynamic = "force-dynamic";

// GET /api/ransomlook/stats — RansomLook platform stats.
export async function GET() {
  const stats = await getStats();
  if (!stats) {
    return NextResponse.json({ error: "RansomLook API unavailable" }, { status: 502 });
  }
  return NextResponse.json(stats);
}

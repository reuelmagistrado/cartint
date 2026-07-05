import { NextRequest, NextResponse } from "next/server";
import { searchRansomLook } from "@/lib/scraper/ransomlook";

export const dynamic = "force-dynamic";

// GET /api/ransomlook/search?q={query}
// Search across all RansomLook data (groups, posts, leaks, notes).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "A 'q' query param is required." }, { status: 400 });
  }
  const result = await searchRansomLook(q);
  return NextResponse.json(result);
}

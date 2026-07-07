import { NextRequest, NextResponse } from "next/server";
import { checkGroupHealth } from "@/lib/scraper/ransomlook";

export const dynamic = "force-dynamic";

// GET /api/ransomlook/health?name={group_name}
// Returns mirror health (30-day uptime % and daily availability) for a group.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "A 'name' query param is required." }, { status: 400 });
  }
  const result = await checkGroupHealth(name);
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { mapThreatToAtm } from "@/lib/scraper/atm-mapper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/threats/[id]/map-atm — run the full 5-step ATM mapping methodology on a threat.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await mapThreatToAtm(id);
    return NextResponse.json({ ok: true, mapping: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

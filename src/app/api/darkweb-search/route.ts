import { NextRequest, NextResponse } from "next/server";
import { runDarkwebPipeline } from "@/lib/scraper/darkweb-pipeline";
import { classifyBatch as _classifyBatch } from "@/lib/scraper/darkweb-llm-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — the pipeline can take a while

// POST /api/darkweb-search — run the full dark-web scraper pipeline.
// Body: { query: string }
// Returns: the pipeline result (search results, scraped pages, accepted threats).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "A 'query' field is required." },
        { status: 400 },
      );
    }

    const result = await runDarkwebPipeline(query);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/report-jobs";

export const dynamic = "force-dynamic";

// GET /api/cti-reports/result?jobId=xxx — returns the completed report.
// Called by the client after polling /status returns status="complete".
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId parameter" }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found (may have expired)" }, { status: 404 });
  }
  if (job.status === "pending") {
    return NextResponse.json({ ok: false, error: "Job still pending", status: job.status }, { status: 202 });
  }
  if (job.status === "error") {
    return NextResponse.json({ ok: false, error: job.error || "Generation failed", status: job.status }, { status: 500 });
  }
  // status === "complete"
  return NextResponse.json({ ok: true, report: job.report });
}

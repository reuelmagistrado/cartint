import { NextRequest, NextResponse } from "next/server";
import { generateCtiReport, type ReportConfig } from "@/lib/cti-report-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — LLM report generation can take a while

// POST /api/cti-reports/generate — generate a structured CTI report.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const config: ReportConfig = {
      type: body.type || "weekly-digest",
      timeRangeDays: body.timeRangeDays || 7,
      customStartDate: body.customStartDate,
      customEndDate: body.customEndDate,
      threatActor: body.threatActor,
      sector: body.sector,
      threatIds: body.threatIds,
      campaignFilter: body.campaignFilter,
      campaignFilterValue: body.campaignFilterValue,
      singleThreatId: body.singleThreatId,
      priority: body.priority || "high",
      tlp: body.tlp || "TLP:AMBER",
      companyName: body.companyName,
      sections: body.sections,
    };

    const report = await generateCtiReport(config);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

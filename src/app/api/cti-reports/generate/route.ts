import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai-provider";
import {
  type ReportConfig,
  type GeneratedReport,
  REPORT_TYPE_META,
  gatherThreats,
  buildReportPrompt,
  buildTemplateReport,
} from "@/lib/cti-report-generator";
import { isContentFilterError } from "@/lib/scraper/heuristic";
import { createJob, getJob, completeJob, failJob, updateJobProgress } from "@/lib/report-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // Fast — just starts the job and returns

// POST /api/cti-reports/generate — starts async report generation.
//
// Instead of streaming (which fails through the Caddy gateway because the
// browser disconnects mid-stream on long responses), this endpoint:
//   1. Gathers threats + builds the prompt
//   2. Creates a job in memory
//   3. Starts the AI call in the background (not awaited)
//   4. Immediately returns { ok: true, jobId }
//
// The client polls GET /api/cti-reports/status?jobId=xxx until status="complete",
// then fetches the full report. Each poll is fast (<100ms), so no gateway timeout.
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

    const meta = REPORT_TYPE_META[config.type];
    const days = config.timeRangeDays || meta.defaultDays;
    const since = new Date(Date.now() - days * 86400000);

    // Gather threats based on report type + time range
    const threats = await gatherThreats(config, since);

    if (threats.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No accepted automotive threats match the selected criteria and time range." },
        { status: 400 },
      );
    }

    // Build the AI prompt with ALL threats (no cap)
    const prompt = buildReportPrompt(config, threats, days);

    // Pre-compute report metadata
    const reportId = `CARTINT-CTI-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const titleSuffix = config.type === "weekly-digest"
      ? `${days}d`
      : config.type === "threat-actor-profile"
      ? (config.threatActor && config.threatActor !== "all" ? config.threatActor : `all actors`)
      : config.type === "sector-assessment"
      ? (config.sector && config.sector !== "all" ? config.sector : `all sectors`)
      : `${days}d`;
    const title = `${meta.title} — ${titleSuffix} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const reportMeta = {
      id: reportId,
      title,
      type: config.type,
      period: `${days}d`,
      metadata: {
        priority: config.priority || "high",
        tlp: config.tlp || "TLP:AMBER",
        companyName: config.companyName || "",
        reportId,
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        reliability: "B-2 (Usually reliable / Probably true)",
      },
      threatIds: threats.map((t) => t.id),
      generatedAt: new Date().toISOString(),
      method: "llm" as const,
    };

    // Create the job
    const job = createJob();

    // Start the AI generation in the background (NOT awaited).
    // The job is updated when generation completes or fails.
    generateReportInBackground(job.id, config, prompt, reportMeta, threats, days).catch((err) => {
      console.error(`[cti-report] Background generation crashed for job ${job.id}:`, err);
      failJob(job.id, err instanceof Error ? err.message : String(err));
    });

    // Return immediately with the job ID — the client polls for status
    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

// Background generation — runs the AI call and updates the job store.
// Not awaited by the request handler, so the HTTP response returns immediately.
async function generateReportInBackground(
  jobId: string,
  config: ReportConfig,
  prompt: { systemPrompt: string; userPrompt: string },
  reportMeta: Record<string, unknown>,
  threats: Awaited<ReturnType<typeof gatherThreats>>,
  days: number,
) {
  let content = "";
  let method: "llm" | "template" = "llm";

  try {
    const result = await chatCompletion({
      messages: [
        { role: "assistant", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      stream: true,
      thinking: { type: "disabled" },
      max_tokens: 8192,
    });

    if (result.stream) {
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastProgressUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data) continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            if (delta) {
              content += delta;
              // Update progress every 2s for live preview (throttled)
              const now = Date.now();
              if (now - lastProgressUpdate > 2000) {
                lastProgressUpdate = now;
                updateJobProgress(jobId, content);
              }
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim();
        if (data && data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            if (delta) content += delta;
          } catch { /* skip */ }
        }
      }
      try { reader.releaseLock(); } catch { /* ignore */ }
    } else {
      // Non-streaming response — content is in result.content
      content = result.content ?? "";
    }

    // If the AI produced content, complete the job
    if (content.trim()) {
      const report: GeneratedReport = {
        ...(reportMeta as Omit<GeneratedReport, "content" | "summary" | "method">),
        content,
        summary: content.slice(0, 400),
        method: "llm",
      };
      completeJob(jobId, report);
      console.log(`[cti-report] Job ${jobId} completed — AI, ${content.length} chars`);
      return;
    }

    // Empty AI output — fall back to template
    console.warn(`[cti-report] Job ${jobId} — AI empty, using template`);
    content = buildTemplateReport(config, threats, days);
    method = "template";
    const templateReport: GeneratedReport = {
      ...(reportMeta as Omit<GeneratedReport, "content" | "summary" | "method">),
      content,
      summary: content.slice(0, 400),
      method: "template",
    };
    completeJob(jobId, templateReport);
  } catch (err) {
    // Content-filter error → template fallback
    if (isContentFilterError(err)) {
      console.warn(`[cti-report] Job ${jobId} — content-filtered, using template`);
      content = buildTemplateReport(config, threats, days);
      const templateReport: GeneratedReport = {
        ...(reportMeta as Omit<GeneratedReport, "content" | "summary" | "method">),
        content,
        summary: content.slice(0, 400),
        method: "template",
      };
      completeJob(jobId, templateReport);
      return;
    }

    // Other error — if we have partial content, use it; otherwise fail
    if (content.trim()) {
      console.warn(`[cti-report] Job ${jobId} — AI error but have partial content (${content.length} chars)`);
      const partialReport: GeneratedReport = {
        ...(reportMeta as Omit<GeneratedReport, "content" | "summary" | "method">),
        content: content + "\n\n---\n*Note: AI generation was interrupted. Partial report shown.*",
        summary: content.slice(0, 400),
        method: "llm",
      };
      completeJob(jobId, partialReport);
    } else {
      failJob(jobId, err instanceof Error ? err.message : String(err));
    }
  }
}

// GET /api/cti-reports/generate — returns job status (for polling)
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId parameter" }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found (may have expired)" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    elapsed: Date.now() - job.startedAt,
    progress: job.progress.slice(-500), // last 500 chars for live preview
    error: job.error,
  });
}

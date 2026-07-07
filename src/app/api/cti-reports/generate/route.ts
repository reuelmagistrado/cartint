import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import {
  type ReportConfig,
  REPORT_TYPE_META,
  gatherThreats,
  buildReportPrompt,
  buildTemplateReport,
} from "@/lib/cti-report-generator";
import { isContentFilterError } from "@/lib/scraper/heuristic";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — streaming keeps the gateway alive

// POST /api/cti-reports/generate — streams the LLM-generated CTI report.
//
// Streaming protocol (text/plain):
//   Line 1: JSON metadata object (report id, title, type, method, etc.)
//   Lines 2+: streamed Markdown content from the LLM (or template fallback)
//
// Streaming is used so the LLM can take as long as it needs — the gateway
// sees continuous data flow (tokens arriving every few hundred ms) and
// never times out. The template fallback is used ONLY for content-filter
// errors (error code 1301), NOT for timeouts.
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

    // Build the LLM prompt with ALL threats (no cap)
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let method: "llm" | "template" = "llm";
        let content = "";
        let metadataSent = false;
        let closed = false;

        // Helper to send the metadata line (only once)
        const sendMetadata = (m: "llm" | "template") => {
          if (metadataSent || closed) return;
          metadataSent = true;
          const metaToSend = { ...reportMeta, method: m };
          controller.enqueue(encoder.encode(JSON.stringify(metaToSend) + "\n"));
        };

        // Safe enqueue — guards against "Controller is already closed" errors
        // which can happen if the client disconnects or the stream is aborted
        // mid-flight (e.g., reader.read() throws after close).
        const safeEnqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };

        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed — ignore
          }
        };

        try {
          const zai = await ZAI.create();
          const result = await zai.chat.completions.create({
            messages: [
              { role: "assistant", content: prompt.systemPrompt },
              { role: "user", content: prompt.userPrompt },
            ],
            stream: true,
            thinking: { type: "disabled" },
          });

          // The SDK returns a ReadableStream when stream:true and the response
          // is text/event-stream. Otherwise it returns the parsed JSON.
          if (result instanceof ReadableStream) {
            const reader = result.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // SSE format: lines starting with "data: " contain JSON
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // keep incomplete line in buffer

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]" || !data) continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    if (!metadataSent) {
                      method = "llm";
                      sendMetadata("llm");
                    }
                    content += delta;
                    safeEnqueue(delta);
                  }
                } catch {
                  // Non-JSON line (e.g., SSE comment) — skip
                }
              }
            }

            // Process any remaining buffer
            if (buffer.startsWith("data: ")) {
              const data = buffer.slice(6).trim();
              if (data && data !== "[DONE]") {
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    if (!metadataSent) {
                      method = "llm";
                      sendMetadata("llm");
                    }
                    content += delta;
                    safeEnqueue(delta);
                  }
                } catch {
                  // skip
                }
              }
            }
          } else {
            // Non-streaming JSON response (fallback path in the SDK)
            const json = result as { choices?: { message?: { content?: string } }[] };
            content = json.choices?.[0]?.message?.content ?? "";
          }

          // If the LLM produced content, we're done
          if (content.trim()) {
            if (!metadataSent) {
              sendMetadata("llm");
            }
            safeClose();
            return;
          }

          // Empty LLM output — fall back to template
          console.warn("[cti-report] LLM produced empty output, using template fallback.");
          method = "template";
          content = buildTemplateReport(config, threats, days);
          sendMetadata("template");
          safeEnqueue(content);
          safeClose();
        } catch (err) {
          // If we already closed the stream (e.g., client disconnected), just
          // log and return — don't try to write to a closed controller.
          if (closed) {
            console.warn("[cti-report] Stream already closed (client likely disconnected):", err);
            return;
          }

          // Content-filter error (code 1301) is the ONLY case we fall back
          // to the template. Timeouts don't happen with streaming.
          if (isContentFilterError(err)) {
            console.warn("[cti-report] LLM content-filtered, using template fallback.");
            method = "template";
            content = buildTemplateReport(config, threats, days);
            sendMetadata("template");
            safeEnqueue(content);
          } else {
            // Other errors — if we already streamed partial content, append an
            // error note; otherwise fall back to the template.
            console.error("[cti-report] LLM stream failed:", err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (!metadataSent) {
              method = "template";
              content = buildTemplateReport(config, threats, days);
              sendMetadata("template");
              safeEnqueue(content);
            } else {
              safeEnqueue(`\n\n---\n*Error: LLM stream interrupted (${errMsg}). Partial report shown above.*`);
            }
          }
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

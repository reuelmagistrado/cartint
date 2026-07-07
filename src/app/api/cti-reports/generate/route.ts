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
// errors (error code 1301) or when the LLM produces no output.
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

    // Track the LLM reader so the cancel() handler can release it when the
    // client disconnects. Without this, the server keeps reading from the LLM
    // after the client is gone, causing "Controller is already closed" errors.
    let llmReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let clientDisconnected = false;

    const stream = new ReadableStream<Uint8Array>({
      // start() runs when the client connects. It reads the LLM stream and
      // pipes chunks to the client. If the client disconnects, cancel() is
      // called (below), which sets clientDisconnected and releases the LLM reader.
      async start(controller) {
        let content = "";
        let metadataSent = false;

        // ALL controller writes go through these safe helpers. They catch
        // "Controller is already closed" errors that happen when the client
        // disconnects mid-stream.
        const safeEnqueue = (chunk: string) => {
          if (clientDisconnected) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            clientDisconnected = true;
          }
        };

        const safeClose = () => {
          if (clientDisconnected) return;
          try {
            controller.close();
          } catch {
            // already closed — ignore
          }
        };

        const sendMetadata = (m: "llm" | "template") => {
          if (metadataSent || clientDisconnected) return;
          metadataSent = true;
          const metaToSend = { ...reportMeta, method: m };
          safeEnqueue(JSON.stringify(metaToSend) + "\n");
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
            // Allow a large output so the LLM can complete ALL 13 sections
            // without hitting a token limit (default is often 4096 which
            // truncates long reports). 8192 tokens ≈ 30-40KB of Markdown.
            max_tokens: 8192,
          });

          // The SDK returns a ReadableStream when stream:true and the response
          // is text/event-stream. Otherwise it returns the parsed JSON.
          if (result instanceof ReadableStream) {
            llmReader = result.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              // If the client disconnected, stop reading from the LLM
              if (clientDisconnected) break;

              const { done, value } = await llmReader.read();
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
                    if (!metadataSent) sendMetadata("llm");
                    content += delta;
                    safeEnqueue(delta);
                  }
                } catch {
                  // Non-JSON line (e.g., SSE comment) — skip
                }
              }
            }

            // Process any remaining buffer
            if (!clientDisconnected && buffer.startsWith("data: ")) {
              const data = buffer.slice(6).trim();
              if (data && data !== "[DONE]") {
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    if (!metadataSent) sendMetadata("llm");
                    content += delta;
                    safeEnqueue(delta);
                  }
                } catch {
                  // skip
                }
              }
            }

            // Release the reader lock
            try { llmReader.releaseLock(); } catch { /* ignore */ }
            llmReader = null;
          } else {
            // Non-streaming JSON response (SDK fallback path)
            const json = result as { choices?: { message?: { content?: string } }[] };
            content = json.choices?.[0]?.message?.content ?? "";
          }

          // If the client disconnected during streaming, we're done — don't
          // try to write more.
          if (clientDisconnected) return;

          // If the LLM produced content, send an end-of-stream marker so the
          // client knows the report is complete (even if the TCP connection
          // closes uncleanly afterward). Then close the stream.
          if (content.trim()) {
            if (!metadataSent) sendMetadata("llm");
            // End-of-stream marker — the client checks for this to know the
            // report is truly complete, suppressing false "partially generated"
            // warnings when the connection resets after all data is sent.
            safeEnqueue("\n\n__END_OF_REPORT__\n");
            safeClose();
            return;
          }

          // Empty LLM output — fall back to template
          console.warn("[cti-report] LLM produced empty output, using template fallback.");
          content = buildTemplateReport(config, threats, days);
          sendMetadata("template");
          safeEnqueue(content);
          safeEnqueue("\n\n__END_OF_REPORT__\n");
          safeClose();
        } catch (err) {
          // If the client disconnected, just return — don't try to write.
          if (clientDisconnected) {
            return;
          }

          // Content-filter error (code 1301) — fall back to template
          if (isContentFilterError(err)) {
            console.warn("[cti-report] LLM content-filtered, using template fallback.");
            content = buildTemplateReport(config, threats, days);
            sendMetadata("template");
            safeEnqueue(content);
            safeEnqueue("\n\n__END_OF_REPORT__\n");
            safeClose();
          } else {
            // Other errors — if we already streamed partial content, append an
            // error note; otherwise fall back to the template.
            console.error("[cti-report] LLM stream failed:", err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (!metadataSent) {
              content = buildTemplateReport(config, threats, days);
              sendMetadata("template");
              safeEnqueue(content);
              safeEnqueue("\n\n__END_OF_REPORT__\n");
            } else {
              safeEnqueue(`\n\n---\n*Error: LLM stream interrupted (${errMsg}). Partial report shown above.*`);
            }
            safeClose();
          }
        }
      },

      // cancel() is called when the client disconnects (closes the tab,
      // navigates away, or the connection drops). We release the LLM reader
      // so the server stops reading from the LLM and doesn't try to write
      // to the closed controller.
      cancel() {
        clientDisconnected = true;
        if (llmReader) {
          try { llmReader.cancel(); } catch { /* ignore */ }
          try { llmReader.releaseLock(); } catch { /* ignore */ }
          llmReader = null;
        }
        console.log("[cti-report] Client disconnected — LLM reader released.");
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

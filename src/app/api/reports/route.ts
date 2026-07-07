import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";
import { isContentFilterError } from "@/lib/scraper/heuristic";

export const dynamic = "force-dynamic";

// GET /api/reports — list saved CTI reports.
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();
  const reports = await db.report.findMany({ orderBy: { generatedAt: "desc" } });
  return NextResponse.json({ reports });
}

// Build a structured CTI report from the dataset WITHOUT calling the AI.
// Used as a fallback when the AI rejects the threat data under its
// content-safety filter (error code 1301) — common for dark-web threat text.
function buildTemplateReport(
  period: string,
  threats: Awaited<ReturnType<typeof db.threat.findMany>>,
): { content: string; summary: string } {
  const total = threats.length;
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = new Map<string, number>();
  const byTactic = new Map<string, number>();
  const byActor = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byCountry = new Map<string, number>();
  for (const t of threats) {
    bySeverity[t.severity as keyof typeof bySeverity]++;
    if (t.automotiveCategory) byCategory.set(t.automotiveCategory, (byCategory.get(t.automotiveCategory) ?? 0) + 1);
    if (t.atmTactic) byTactic.set(t.atmTactic, (byTactic.get(t.atmTactic) ?? 0) + 1);
    if (t.actor) byActor.set(t.actor, (byActor.get(t.actor) ?? 0) + 1);
    bySource.set(t.sourceName, (bySource.get(t.sourceName) ?? 0) + 1);
    if (t.country) byCountry.set(t.country, (byCountry.get(t.country) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const lines: string[] = [];
  lines.push("# CARTINT Cyber Threat Intelligence Report");
  lines.push("");
  lines.push(`**Period:** ${period}  `);
  lines.push(`**Total accepted automotive threats:** ${total}  `);
  lines.push(`**Severity breakdown:** ${bySeverity.critical} critical / ${bySeverity.high} high / ${bySeverity.medium} medium / ${bySeverity.low} low  `);
  lines.push(`**Generation method:** Structured template (AI content-filter fallback)  `);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(
    `Over the ${period} window, CARTINT surfaced ${total} automotive-relevant threats across ${bySource.size} intelligence sources. ` +
      `${bySeverity.critical} critical-severity incidents pose immediate risk to automotive OT, supply chain, or connected-vehicle infrastructure. ` +
      `The most affected automotive category is ${top(byCategory, 1)[0]?.[0] ?? "n/a"}, and the most active threat actor is ${top(byActor, 1)[0]?.[0] ?? "unattributed"}.`,
  );
  lines.push("");

  lines.push("## Key Findings");
  lines.push("");
  const sorted = [...threats].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order];
  });
  for (const t of sorted.slice(0, 10)) {
    lines.push(`- **[${t.severity.toUpperCase()}]** ${t.title} — ${t.victimOrg ?? "unknown victim"} (${t.country ?? "unknown"})${t.actor ? `, actor: ${t.actor}` : ""}. Source: ${t.sourceName}.`);
  }
  lines.push("");

  lines.push("## Threat-Actor Activity");
  lines.push("");
  if (byActor.size === 0) {
    lines.push("- No threat actors attributed in this period.");
  } else {
    for (const [actor, count] of top(byActor, 8)) {
      lines.push(`- **${actor}** — ${count} incident${count > 1 ? "s" : ""}`);
    }
  }
  lines.push("");

  lines.push("## Auto-ISAC ATM Mapping");
  lines.push("");
  if (byTactic.size === 0) {
    lines.push("- No ATM tactics mapped in this period.");
  } else {
    for (const [tactic, count] of top(byTactic, 11)) {
      lines.push(`- **${tactic}** — ${count} threat${count > 1 ? "s" : ""}`);
    }
  }
  lines.push("");

  lines.push("## Affected Automotive Categories");
  lines.push("");
  for (const [cat, count] of top(byCategory, 12)) {
    lines.push(`- ${cat}: ${count}`);
  }
  lines.push("");

  lines.push("## Geographic Distribution");
  lines.push("");
  for (const [country, count] of top(byCountry, 10)) {
    lines.push(`- ${country}: ${count}`);
  }
  lines.push("");

  lines.push("## Intelligence Sources");
  lines.push("");
  for (const [src, count] of top(bySource, 10)) {
    lines.push(`- ${src}: ${count} threat${count > 1 ? "s" : ""}`);
  }
  lines.push("");

  lines.push("## Recommended Mitigations");
  lines.push("");
  lines.push("- Prioritize patching and network segmentation for any OT/supply-chain assets matching affected categories.");
  lines.push("- Review OTA firmware signing key custody and enforce HSM-backed signing for all ECU updates.");
  lines.push("- Audit telematics backends for exposed diagnostic APIs and enforce mutual-TLS + UDS authentication.");
  lines.push("- Monitor dark-web forums for mentions of your organization, brand, or component names.");
  lines.push("- Validate EV charging CSMS/OCPP implementations against the latest protocol security baselines.");
  lines.push("- Enforce phishing-resistant MFA for all fleet, dealership, and OEM portal administrative accounts.");
  lines.push("");

  lines.push("## Indicators & Sources");
  lines.push("");
  lines.push(`Report generated from ${total} threats ingested across ${bySource.size} sources. Each threat retains its source URL and AI classification confidence score in the CARTINT dashboard.`);

  const content = lines.join("\n");
  const summary =
    `${total} automotive threats over ${period}. ${bySeverity.critical} critical / ${bySeverity.high} high. ` +
    `Top category: ${top(byCategory, 1)[0]?.[0] ?? "n/a"}. Top actor: ${top(byActor, 1)[0]?.[0] ?? "unattributed"}.`.slice(0, 400);
  return { content, summary };
}

// POST /api/reports — generate a new CTI report via the AI.
// Body: { title?, period? }  — period e.g. "2025-01" or "last-30-days"
export async function POST(req: NextRequest) {
  await ensureSourcesSeeded();
  await seedIfEmpty();
  try {
    const body = await req.json().catch(() => ({}));
    const period = String(body?.period ?? "last-30-days");
    const titleInput = String(body?.title ?? "").trim();

    // Pull the most recent accepted threats for the report window.
    const since = new Date(Date.now() - 30 * 86400000);
    const threats = await db.threat.findMany({
      where: {
        isAutomotive: true,
        relevanceScore: { gte: RELEVANCE_THRESHOLD },
        attackDate: { gte: since },
      },
      orderBy: { attackDate: "desc" },
      take: 40,
    });

    if (threats.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No accepted automotive threats in the report window." },
        { status: 400 },
      );
    }

    let content = "";
    let summary = "";
    let usedFallback = false;

    try {
      const dataset = threats.map((t) => ({
        title: t.title,
        source: t.sourceName,
        severity: t.severity,
        category: t.automotiveCategory,
        tactic: t.atmTactic,
        technique: t.atmTechnique,
        actor: t.actor,
        victim: t.victimOrg,
        country: t.country,
        date: t.attackDate,
        score: t.relevanceScore,
      }));

      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You are a senior automotive cyber-threat-intelligence analyst writing a defensive CTI report for an internal dashboard. Write in a clinical, factual, defensive tone. Sections: Executive Summary, Key Findings, Threat-Actor Activity, Auto-ISAC ATM Mapping, Affected Automotive Categories, Recommended Mitigations, Indicators & Sources. Do not include offensive instructions; focus on defender posture and mitigation.",
          },
          {
            role: "user",
            content: `Period: ${period}\nAccepted automotive threats (${threats.length}):\n${JSON.stringify(dataset, null, 2)}`,
          },
        ],
        thinking: { type: "disabled" },
      });
      content = completion.choices[0]?.message?.content ?? "";
      const summaryMatch = content.match(/Executive Summary[\s\S]*?(?:\n#{1,3}|\n\n)/);
      summary = summaryMatch ? summaryMatch[0].replace(/^.*?\n/, "").trim().slice(0, 400) : content.slice(0, 400);
    } catch (llmErr) {
      // If the AI rejected the input under its content-safety filter (code 1301),
      // fall back to a structured template report so the analyst still gets output.
      if (isContentFilterError(llmErr)) {
        const tpl = buildTemplateReport(period, threats);
        content = tpl.content;
        summary = tpl.summary;
        usedFallback = true;
      } else {
        throw llmErr;
      }
    }

    const title = titleInput || `CARTINT CTI Report — ${period}${usedFallback ? " (auto)" : ""}`;

    const report = await db.report.create({
      data: {
        title,
        summary,
        period,
        threatIds: threats.map((t) => t.id).join(","),
        content,
      },
    });

    return NextResponse.json({ ok: true, report, fallback: usedFallback });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

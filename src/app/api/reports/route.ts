import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { RELEVANCE_THRESHOLD, ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";

export const dynamic = "force-dynamic";

// GET /api/reports — list saved CTI reports.
export async function GET() {
  await ensureSourcesSeeded();
  await seedIfEmpty();
  const reports = await db.report.findMany({ orderBy: { generatedAt: "desc" } });
  return NextResponse.json({ reports });
}

// POST /api/reports — generate a new CTI report via the LLM.
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
            "You are a senior automotive cyber-threat-intelligence analyst. Write a concise CTI report in Markdown for the CARTINT dashboard. Sections: Executive Summary, Key Findings, Threat-Actor Activity, Auto-ISAC ATM Mapping, Affected Automotive Categories, Recommended Mitigations, Indicators & Sources. Be factual and only use the provided data.",
        },
        {
          role: "user",
          content: `Period: ${period}\nAccepted automotive threats (${threats.length}):\n${JSON.stringify(dataset, null, 2)}`,
        },
      ],
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const summaryMatch = content.match(/Executive Summary[\s\S]*?(?:\n#{1,3}|\n\n)/);
    const summary = summaryMatch ? summaryMatch[0].replace(/^.*?\n/, "").trim().slice(0, 400) : content.slice(0, 400);
    const title = titleInput || `CARTINT CTI Report — ${period}`;

    const report = await db.report.create({
      data: {
        title,
        summary,
        period,
        threatIds: threats.map((t) => t.id).join(","),
        content,
      },
    });

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

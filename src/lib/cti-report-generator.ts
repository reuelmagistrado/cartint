// CTI Report Generator — produces structured automotive threat intelligence reports.
//
// Supports 6 report types:
//   1. Weekly Threat Digest (7d)
//   2. Threat Actor Profile (30d or custom)
//   3. Incident Report (single threat)
//   4. Campaign Analysis (14d or 30d)
//   5. Sector Threat Assessment (30d)
//   6. Ad-Hoc Report (custom threat selection)
//
// Each report is generated via AI with a structured prompt based on the
// CARTINT CTI Report Template, falling back to a template generator on
// content-filter errors.

import { chatCompletion } from "@/lib/ai-provider";
import { db } from "@/lib/db";
import { RELEVANCE_THRESHOLD } from "@/lib/scraper";
import { isContentFilterError } from "@/lib/scraper/heuristic";
import { ATM_TACTICS } from "@/lib/atm";

export type ReportType =
  | "weekly-digest"
  | "threat-actor-profile"
  | "incident-report"
  | "campaign-analysis"
  | "sector-assessment"
  | "ad-hoc";

export type ReportConfig = {
  type: ReportType;
  timeRangeDays: number;
  customStartDate?: string;
  customEndDate?: string;
  threatActor?: string;
  sector?: string;
  threatIds?: string[];
  campaignFilter?: "actor" | "sector" | "country";
  campaignFilterValue?: string;
  singleThreatId?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tlp?: "TLP:WHITE" | "TLP:GREEN" | "TLP:AMBER" | "TLP:RED";
  companyName?: string;
  sections?: string[];
};

export type GeneratedReport = {
  id: string;
  title: string;
  type: ReportType;
  content: string;
  summary: string;
  period: string;
  metadata: {
    priority: string;
    tlp: string;
    companyName: string;
    reportId: string;
    date: string;
    reliability: string;
  };
  threatIds: string[];
  generatedAt: string;
  method: "llm" | "template";
};

export const REPORT_TYPE_META: Record<ReportType, { title: string; defaultDays: number }> = {
  "weekly-digest": { title: "Weekly Threat Digest", defaultDays: 7 },
  "threat-actor-profile": { title: "Threat Actor Profile", defaultDays: 30 },
  "incident-report": { title: "Incident Report", defaultDays: 30 },
  "campaign-analysis": { title: "Campaign Analysis", defaultDays: 14 },
  "sector-assessment": { title: "Sector Threat Assessment", defaultDays: 30 },
  "ad-hoc": { title: "Ad-Hoc Report", defaultDays: 30 },
};

export async function generateCtiReport(config: ReportConfig): Promise<GeneratedReport> {
  const meta = REPORT_TYPE_META[config.type];
  const days = config.timeRangeDays || meta.defaultDays;
  const since = new Date(Date.now() - days * 86400000);

  // Gather threat data based on report type
  const threats = await gatherThreats(config, since);

  // Build the AI prompt
  const prompt = buildReportPrompt(config, threats, days);

  let content = "";
  let method: "llm" | "template" = "llm";

  // Server-side AI timeout: race the AI call against a hard 12s deadline.
  // The cloud sandbox gateway sits in front of Caddy and has its own ~30s
  // timeout, so the ENTIRE request (DB query + AI + fallback) must finish
  // well under that. 12s for the AI + ~1s overhead = ~13s total, safely
  // under the gateway limit. If the AI is slow, the template report (which
  // is comprehensive — all 13 CARTINT sections) is returned instantly.
  const AI_TIMEOUT_MS = 12_000;
  try {
    const llmPromise = chatCompletion({
      messages: [
        { role: "assistant", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_TIMEOUT_MS),
    );
    const result = (await Promise.race([llmPromise, timeoutPromise])) as {
      content: string;
    };
    content = result.content ?? "";
    if (!content.trim()) {
      // Empty AI output — fall back to template so we never return a blank report.
      content = buildTemplateReport(config, threats, days);
      method = "template";
    }
  } catch (err) {
    // ANY error (content-filter, timeout, network, malformed response) falls back
    // to the deterministic template report. The user always gets a usable report.
    const isTimeout =
      err instanceof Error &&
      (err.message === "AI_TIMEOUT" ||
        /timeout|abort|timed?\s*out/i.test(err.message));
    if (isTimeout || isContentFilterError(err)) {
      console.warn(
        `[cti-report] AI ${isTimeout ? "timed out" : "content-filtered"}, using template fallback.`,
      );
    } else {
      console.warn("[cti-report] AI call failed, using template fallback:", err);
    }
    content = buildTemplateReport(config, threats, days);
    method = "template";
  }

  const reportId = `CARTINT-CTI-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  // Build the title suffix based on report type + selection
  const titleSuffix = config.type === "weekly-digest"
    ? `${days}d`
    : config.type === "threat-actor-profile"
    ? (config.threatActor && config.threatActor !== "all" ? config.threatActor : `all actors`)
    : config.type === "sector-assessment"
    ? (config.sector && config.sector !== "all" ? config.sector : `all sectors`)
    : `${days}d`;
  const title = `${meta.title} — ${titleSuffix} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Extract summary from content (first paragraph after "## Threat Overview" or first 400 chars)
  const summaryMatch = content.match(/## (?:Threat Overview|Executive Summary)[\s\S]*?\n([\s\S]*?)(?:\n##|\n---|\Z)/i);
  const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 400) : content.slice(0, 400);

  return {
    id: reportId,
    title,
    type: config.type,
    content,
    summary,
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
    method,
  };
}

// Gather threats based on report type and config
export async function gatherThreats(config: ReportConfig, since: Date) {
  const accepted = {
    isAutomotive: true,
    relevanceScore: { gte: RELEVANCE_THRESHOLD },
  } as const;

  switch (config.type) {
    case "incident-report": {
      // If a specific threat ID is given, fetch that one. Otherwise
      // ("auto-select most recent"), fetch the most recent accepted threat.
      if (config.singleThreatId && config.singleThreatId !== "all") {
        return db.threat.findMany({ where: { id: config.singleThreatId, ...accepted } });
      }
      return db.threat.findMany({
        where: { ...accepted, attackDate: { gte: since } },
        orderBy: { attackDate: "desc" }, take: 1,
      });
    }
    case "threat-actor-profile": {
      // If a specific actor is named, fetch only their threats (single-actor
      // deep-dive). If "all" or unspecified, fetch ALL threats across ALL
      // actors in the window so the report can profile every actor.
      if (config.threatActor && config.threatActor !== "all") {
        return db.threat.findMany({
          where: { ...accepted, actor: config.threatActor, attackDate: { gte: since } },
          orderBy: { attackDate: "desc" }, take: 50,
        });
      }
      // "all actors" — fetch every attributed threat in the window
      return db.threat.findMany({
        where: { ...accepted, attackDate: { gte: since }, actor: { not: null } },
        orderBy: { attackDate: "desc" }, take: 100,
      });
    }
    case "campaign-analysis": {
      const where: Record<string, unknown> = { ...accepted, attackDate: { gte: since } };
      if (config.campaignFilter === "actor" && config.campaignFilterValue) where.actor = config.campaignFilterValue;
      if (config.campaignFilter === "sector" && config.campaignFilterValue) where.automotiveCategory = config.campaignFilterValue;
      if (config.campaignFilter === "country" && config.campaignFilterValue) where.country = config.campaignFilterValue;
      return db.threat.findMany({ where, orderBy: { attackDate: "desc" }, take: 50 });
    }
    case "sector-assessment": {
      // If a specific sector is named, fetch only threats in that sector.
      // If "all" or unspecified, auto-select the MOST-TARGETED sector.
      if (config.sector && config.sector !== "all") {
        return db.threat.findMany({
          where: { ...accepted, automotiveCategory: config.sector, attackDate: { gte: since } },
          orderBy: { attackDate: "desc" }, take: 50,
        });
      }
      const allRecentSectors = await db.threat.findMany({
        where: { ...accepted, attackDate: { gte: since }, automotiveCategory: { not: null } },
        select: { automotiveCategory: true },
      });
      const sectorCounts = new Map<string, number>();
      for (const t of allRecentSectors) {
        if (t.automotiveCategory) sectorCounts.set(t.automotiveCategory, (sectorCounts.get(t.automotiveCategory) || 0) + 1);
      }
      const topSector = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!topSector) return [];
      return db.threat.findMany({
        where: { ...accepted, automotiveCategory: topSector, attackDate: { gte: since } },
        orderBy: { attackDate: "desc" }, take: 50,
      });
    }
    case "ad-hoc": {
      if (!config.threatIds?.length) return [];
      return db.threat.findMany({ where: { id: { in: config.threatIds }, ...accepted } });
    }
    case "weekly-digest":
    default: {
      return db.threat.findMany({
        where: { ...accepted, attackDate: { gte: since } },
        orderBy: { attackDate: "desc" }, take: 100,
      });
    }
  }
}

// Build the AI prompt for report generation
export function buildReportPrompt(config: ReportConfig, threats: any[], days: number) {
  const meta = REPORT_TYPE_META[config.type];
  const sections = config.sections || [
    "Threat Overview", "Adversary Interest Analysis", "Intelligence Levels",
    "Diamond Model", "Cyber Kill Chain", "ATM Mapping", "Collection Methodology",
    "Artifacts", "Risk Assessment", "Source Reliability", "Recommendations",
    "Distribution", "Glossary",
  ];

  // Send ALL threats to the AI (no cap) so the analysis is accurate and
  // reflects the actual threat data in the selected time range. Each threat
  // is trimmed to essential fields to keep the prompt manageable (~500 bytes
  // per threat → ~25KB for 50 threats, well within AI context limits).
  const threatData = threats.map((t) => ({
    title: String(t.title ?? "").slice(0, 120),
    desc: String(t.description ?? "").slice(0, 200),
    sev: t.severity,
    src: t.sourceName,
    actor: t.actor,
    victim: t.victimOrg,
    country: t.country,
    cat: t.automotiveCategory,
    tactic: t.atmTactic,
    technique: t.atmTechnique,
    dataTypes: t.dataTypes ? String(t.dataTypes).slice(0, 80) : undefined,
    date: t.attackDate?.toISOString().slice(0, 10),
    score: t.relevanceScore,
  }));

  // Compact ATM reference — only tactic ID + name + technique IDs (no
  // technique names, no descriptions). The threat data already carries the
  // mapped tactic/technique names, so the AI doesn't need the full taxonomy.
  // This shrinks the ATM block from ~80KB to <1KB.
  const atmCompact = ATM_TACTICS.map(
    (t) => `${t.tacticId} ${t.name}: ${t.techniques.map((x) => x.id).join(", ")}`,
  ).join("\n");

  const systemPrompt = `You are a senior automotive cyber threat intelligence analyst generating a formal CTI report for the CARTINT dashboard.

Generate a ${meta.title} covering the last ${days} days. Sections:
${sections.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

Format:
- Markdown. Tables for structured data (ATM mapping, kill chain, diamond model, risk).
- Report Metadata table at top (Report ID, Date, Priority, Source Reliability, TLP, Company, Title).
- Intelligence Requirements + Data Sources sections.
- Key Terminology glossary at end.
- Priority: ${config.priority || "High"} | TLP: ${config.tlp || "TLP:AMBER"} | Company: ${config.companyName || "[Organization Name Withheld]"}

ATM tactic IDs (for reference; threats are already mapped):
${atmCompact}

Diamond Model: Adversary→Infrastructure, Adversary→Capability, Infrastructure→Victim, Capability→Victim.
Kill Chain: Reconnaissance, Weaponization, Delivery, Exploitation, Installation, C2, Actions on Objective.

Type-specific requirements:
${getReportTypeRequirements(config)}

${threats.length > 50 ? `NOTE: ${threats.length} threats matched the selected time range. ALL ${threats.length} are included in the data below. Analyze every threat for accurate statistics.` : `All ${threats.length} threats matching the selected time range are included below.`}

CRITICAL: You MUST complete ALL ${sections.length} sections listed above. Do NOT stop mid-report. Do NOT omit any section. If you are running low on output space, be more concise in earlier sections so you can complete all of them. Use tables (compact) instead of long prose paragraphs to save space. Every section must have at least a brief table or paragraph.

Output ONLY the Markdown report.`;

  const userPrompt = `Generate the ${meta.title}.

Report Type: ${config.type}
Time Range: Last ${days} days
Total threats matched: ${threats.length} (all included below)
${config.threatActor ? `Threat Actor: ${config.threatActor}\n` : ""}${config.sector ? `Sector: ${config.sector}\n` : ""}${config.singleThreatId ? `Single Threat ID: ${config.singleThreatId}\n` : ""}${config.campaignFilter ? `Campaign Filter: ${config.campaignFilter} = ${config.campaignFilterValue}\n` : ""}${config.threatIds?.length ? `Selected Threat IDs: ${config.threatIds.join(", ")}\n` : ""}
Threat Data:
${JSON.stringify(threatData)}`;

  return { systemPrompt, userPrompt };
}

function getReportTypeRequirements(config: ReportConfig): string {
  switch (config.type) {
    case "weekly-digest":
      return `- Total threats accepted/rejected, FP rate, source health summary
- New threat actors observed
- New CVEs affecting automotive components
- Trending ATM tactics (which tactics saw the most activity)
- Severity breakdown
- Top countries targeted
- Recommended monitoring actions`;
    case "threat-actor-profile":
      if (config.threatActor && config.threatActor !== "all") {
        return `- Single-actor deep-dive on: ${config.threatActor}
- Actor name, first seen, last seen, activity trend
- All threats attributed to this actor (with ATM mappings)
- Diamond Model analysis (Adversary/Infrastructure/Victim/Capabilities)
- Attack playbook (behavioral patterns, preferred ATM techniques)
- Recommended defensive actions against this actor`;
      }
      return `- ALL threat actors active in the window (do NOT profile only one — cover EVERY actor)
- For each actor: name, incident count, first/last seen, countries targeted, preferred tactics, top techniques, top sectors, severity profile
- A comparative summary table of all actors (sorted by incident count)
- Per-actor incident timelines
- Per-actor Diamond Model analysis
- Cross-actor analysis: shared tactics, shared sectors, geographic overlap
- Defensive recommendations covering ALL actors (prioritized by volume)`;
    case "incident-report":
      return `- Full threat metadata (ID, title, severity, source, date)
- Description and IoCs
- ATM tactic/technique mapping
- Cyber Kill Chain reconstruction
- Affected victim details
- Related threats
- Risk assessment
- Immediate recommended actions`;
    case "campaign-analysis":
      return `- Campaign timeline (chronological threat events)
- Common ATM techniques across the campaign
- Victim overlap analysis
- Kill chain comparison across incidents
- Campaign impact assessment
- Strategic/Operational/Tactical intelligence breakdown`;
    case "sector-assessment":
      return `- All threats targeting the selected sector
- Top threat actors active against this sector
- Most common ATM tactics used
- Geographic distribution of victims
- Data types being exfiltrated/sold
- Vulnerability landscape (CVEs)
- Strategic recommendations for sector defense`;
    case "ad-hoc":
      return `- All selected threats with their ATM mappings
- Cross-threat analysis (shared techniques, shared actors)
- Analyst notes section
- Full template with all selected sections`;
    default:
      return "";
  }
}

// ============================================================================
// Template-based fallback report (no AI)
//
// Each report type produces a GENUINELY DISTINCT document — different
// sections, different focus, different analysis structure. The shared
// helpers (metadata table, glossary, distribution, TLP, stats) are factored
// out; the type-specific builders compose them with unique bodies.
// ============================================================================

type ThreatStats = {
  total: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byActor: Map<string, number>;
  byCountry: Map<string, number>;
  byTactic: Map<string, number>;
  byTechnique: Map<string, number>;
  byCategory: Map<string, number>;
  bySource: Map<string, number>;
  actors: Set<string>;
  dataTypes: Set<string>;
  dateRange: { oldest: Date | null; newest: Date | null };
  sortedByDate: any[];
};

function computeStats(threats: any[]): ThreatStats {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byActor = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byTactic = new Map<string, number>();
  const byTechnique = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  const actors = new Set<string>();
  const dataTypes = new Set<string>();
  const dates: Date[] = [];

  for (const t of threats) {
    bySeverity[t.severity as keyof typeof bySeverity] = (bySeverity[t.severity as keyof typeof bySeverity] || 0) + 1;
    if (t.actor) { byActor.set(t.actor, (byActor.get(t.actor) || 0) + 1); actors.add(t.actor); }
    if (t.country) byCountry.set(t.country, (byCountry.get(t.country) || 0) + 1);
    if (t.atmTactic) byTactic.set(t.atmTactic, (byTactic.get(t.atmTactic) || 0) + 1);
    if (t.atmTechnique) byTechnique.set(t.atmTechnique, (byTechnique.get(t.atmTechnique) || 0) + 1);
    if (t.automotiveCategory) byCategory.set(t.automotiveCategory, (byCategory.get(t.automotiveCategory) || 0) + 1);
    bySource.set(t.sourceName, (bySource.get(t.sourceName) || 0) + 1);
    if (t.dataTypes) t.dataTypes.split(",").forEach((d: string) => dataTypes.add(d.trim()));
    if (t.attackDate) dates.push(t.attackDate);
  }

  const sortedByDate = [...threats].sort((a, b) => {
    const ad = a.attackDate ? new Date(a.attackDate).getTime() : 0;
    const bd = b.attackDate ? new Date(b.attackDate).getTime() : 0;
    return bd - ad; // newest first
  });

  const oldest = dates.length ? new Date(Math.min(...dates.map(d => new Date(d).getTime()))) : null;
  const newest = dates.length ? new Date(Math.max(...dates.map(d => new Date(d).getTime()))) : null;

  return {
    total: threats.length,
    bySeverity, byActor, byCountry, byTactic, byTechnique, byCategory, bySource,
    actors, dataTypes, dateRange: { oldest, newest }, sortedByDate,
  };
}

const topN = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const fmtDate = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "—";

// ---- Shared header / footer helpers ----

function buildHeader(meta: { title: string }, subtitle: string): string[] {
  return [`# ${meta.title}`, "", `> ${subtitle}`, "", "---", ""];
}

function buildMetadataTable(
  meta: { title: string }, reportId: string, date: string, priority: string,
  tlp: string, company: string, reportTitle: string,
): string[] {
  return [
    "## Report Metadata", "",
    "| Field | Value |", "|---|---|",
    `| **Report ID** | ${reportId} |`,
    `| **Date** | ${date} |`,
    `| **Priority** | ${priority} |`,
    `| **Source & Information Reliability** | B-2 (Usually reliable / Probably true) |`,
    `| **Sensitivity** | ${tlp} |`,
    `| **Company Name** | ${company} |`,
    `| **Report Title** | ${reportTitle} |`,
    "",
  ];
}

function buildGlossary(): string[] {
  return [
    "## Key Terminology", "",
    "| Term | Definition |", "|---|---|",
    "| **ATM** | Auto-ISAC Automotive Threat Matrix — vehicle-domain adaptation of MITRE ATT&CK |",
    "| **VSOC** | Vehicle Security Operations Center |",
    "| **RaaS** | Ransomware-as-a-Service |",
    "| **SOCK Puppet** | Fictitious online persona for intelligence collection |",
    "| **Double Extortion** | Ransomware model: encrypt + threaten to publish |",
    "| **Telematics** | Telecommunications + informatics for remote vehicles |",
    "| **OTA** | Over-the-Air — wireless software/firmware updates |",
    "| **ECU** | Electronic Control Unit — embedded vehicle system controller |",
    "| **Diamond Model** | Intrusion analysis framework: Adversary–Infrastructure–Capability–Victim |",
    "| **Kill Chain** | Lockheed Martin's 7-stage attack progression model |",
    "",
  ];
}

function buildDistribution(tlp: string): string[] {
  return [
    "## Distribution", "",
    "| Role | Dissemination |", "|---|---|",
    "| Head of CTI | Full report |",
    "| VSOC Lead | Full report |",
    "| CTI Analyst (Author) | Full report |",
    "| Auto-ISAC | Sanitized version (TLP:GREEN) |",
    "",
    "## TLP Classification", "",
    `**${tlp}** — Sensitive information shared on a need-to-know basis within the organization and Auto-ISAC partners.`,
    "",
  ];
}

function buildFooter(): string[] {
  return [
    "---", "",
    "*This report was generated with CARTINT — Automotive Threat Intelligence Dashboard. "
    + "Data collected from OSINT sources, processed through AI-based automotive relevance "
    + "classification (confidence ≥ 70%), and mapped to the Auto-ISAC Automotive Threat Matrix. "
    + "Generation method: template (AI fallback).*",
  ];
}

// Accurate time-range block: shows BOTH the selected window AND the actual
// date range of the matched threats so the analyst can verify accuracy.
function buildTimeRangeBlock(days: number, stats: ThreatStats): string[] {
  const { oldest, newest } = stats.dateRange;
  const spreadDays = oldest && newest
    ? Math.max(1, Math.ceil((new Date(newest).getTime() - new Date(oldest).getTime()) / 86400000) + 1)
    : 0;
  return [
    "| **Selected Window** | Last " + days + " days |",
    "| **Actual Threat Date Range** | " + fmtDate(oldest) + " → " + fmtDate(newest) + " |",
    "| **Threats in Window** | " + stats.total + " |",
    "| **Date Spread** | " + (spreadDays > 0 ? spreadDays + " day" + (spreadDays > 1 ? "s" : "") : "—") + " |",
  ];
}

// ---- Type-specific builders ----

function buildWeeklyDigest(config: ReportConfig, threats: any[], days: number): string[] {
  const s = computeStats(threats);
  const L: string[] = [];
  L.push("## Executive Summary", "");
  L.push(`This Weekly Threat Digest summarizes **${s.total}** accepted automotive threats observed over the last **${days} days** (${fmtDate(s.dateRange.oldest)} → ${fmtDate(s.dateRange.newest)}). ${s.actors.size} unique threat actor${s.actors.size === 1 ? "" : "s"} were active across ${s.byCountry.size} countr${s.byCountry.size === 1 ? "y" : "ies"}. The most active actor was **${topN(s.byActor, 1)[0]?.[0] || "unattributed"}** (${topN(s.byActor, 1)[0]?.[1] || 0} incidents). Severity breakdown: **${s.bySeverity.critical} critical / ${s.bySeverity.high} high / ${s.bySeverity.medium} medium / ${s.bySeverity.low} low**.`, "");
  L.push("## Threat Overview", "");
  L.push("| Field | Value |", "|---|---|");
  L.push(`| **Report Type** | Weekly Threat Digest |`);
  L.push(...buildTimeRangeBlock(days, s));
  L.push(`| **Unique Actors** | ${s.actors.size} |`);
  L.push(`| **Countries Affected** | ${s.byCountry.size} |`);
  L.push(`| **Severity Breakdown** | ${s.bySeverity.critical} Critical / ${s.bySeverity.high} High / ${s.bySeverity.medium} Medium / ${s.bySeverity.low} Low |`);
  L.push("");
  // Full threat list with count + ALL threats (not capped at 30)
  L.push(`### All Threats This Period (${s.total})`, "");
  L.push("| # | Date | Title | Severity | Actor | Victim | Country | ATM Tactic |");
  L.push("|---|---|---|---|---|---|---|---|");
  s.sortedByDate.forEach((t, i) => {
    L.push(`| ${i + 1} | ${fmtDate(t.attackDate)} | ${String(t.title).slice(0, 50)} | ${t.severity} | ${t.actor || "—"} | ${t.victimOrg || "—"} | ${t.country || "—"} | ${t.atmTactic || "—"} |`);
  });
  L.push("");
  // Source health
  L.push("## Source Health Summary", "");
  L.push("| Source | Threats | % of Total |", "|---|---|---|");
  for (const [src, count] of topN(s.bySource, 10)) {
    L.push(`| ${src} | ${count} | ${Math.round((count / s.total) * 100)}% |`);
  }
  L.push("");
  // New actors
  L.push("## Threat Actors Active This Period", "");
  if (s.byActor.size === 0) { L.push("- No actors attributed in this period."); }
  else {
    L.push("| Actor | Incidents | Primary Tactic | Top Target Country |", "|---|---|---|---|");
    for (const [actor, count] of topN(s.byActor, 10)) {
      const actorThreats = threats.filter((t) => t.actor === actor);
      const tacitc = topN(new Map(actorThreats.map((t) => [t.atmTactic || "—", 1])), 1)[0]?.[0] || "—";
      const country = topN(new Map(actorThreats.map((t) => [t.country || "—", 1])), 1)[0]?.[0] || "—";
      L.push(`| ${actor} | ${count} | ${tacitc} | ${country} |`);
    }
  }
  L.push("");
  // Trending tactics
  L.push("## Trending ATM Tactics", "");
  L.push("| ATM Tactic | Count | Top Technique |", "|---|---|---|");
  for (const [tactic, count] of topN(s.byTactic, 14)) {
    const techs = threats.filter((t) => t.atmTactic === tactic).map((t) => t.atmTechnique).filter(Boolean);
    L.push(`| ${tactic} | ${count} | ${[...new Set(techs)][0] || "—"} |`);
  }
  L.push("");
  // Geographic
  L.push("## Geographic Distribution", "");
  L.push("| Country | Threats |", "|---|---|");
  for (const [country, count] of topN(s.byCountry, 15)) L.push(`| ${country} | ${count} |`);
  L.push("");
  // Sector breakdown
  L.push("## Targeted Automotive Sectors", "");
  L.push("| Sector | Threats |", "|---|---|");
  for (const [cat, count] of topN(s.byCategory, 12)) L.push(`| ${cat} | ${count} |`);
  L.push("");
  return L;
}

function buildThreatActorProfile(config: ReportConfig, threats: any[], days: number): string[] {
  const s = computeStats(threats);
  const isMultiActor = !config.threatActor || config.threatActor === "all";

  // ---- MULTI-ACTOR MODE: profile ALL actors ----
  if (isMultiActor) {
    return buildMultiActorProfile(threats, days, s);
  }

  // ---- SINGLE-ACTOR MODE: deep-dive on the selected actor ----
  const actorName = config.threatActor!;
  const actorThreats = threats.filter((t) => t.actor === actorName);
  const L: string[] = [];
  L.push("## Actor Profile", "");
  L.push("| Attribute | Value |", "|---|---|");
  L.push(`| **Actor Name** | ${actorName} |`);
  L.push(`| **Total Attributed Threats** | ${actorThreats.length} |`);
  L.push(`| **First Seen (in window)** | ${fmtDate(actorThreats.length ? actorThreats.reduce((min, t) => t.attackDate < min.attackDate ? t : min).attackDate : null)} |`);
  L.push(`| **Last Seen (in window)** | ${fmtDate(actorThreats.length ? actorThreats.reduce((max, t) => t.attackDate > max.attackDate ? t : max).attackDate : null)} |`);
  const actorCountries = new Map<string, number>();
  actorThreats.forEach((t) => { if (t.country) actorCountries.set(t.country, (actorCountries.get(t.country) || 0) + 1); });
  L.push(`| **Countries Targeted** | ${actorCountries.size} (${[...actorCountries.entries()].map(([c, n]) => `${c} (${n})`).join(", ") || "—"}) |`);
  const actorTactics = new Map<string, number>();
  actorThreats.forEach((t) => { if (t.atmTactic) actorTactics.set(t.atmTactic, (actorTactics.get(t.atmTactic) || 0) + 1); });
  L.push(`| **Preferred ATM Tactic** | ${topN(actorTactics, 1)[0]?.[0] || "—"} (${topN(actorTactics, 1)[0]?.[1] || 0} uses) |`);
  const actorSeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  actorThreats.forEach((t) => { actorSeverity[t.severity as keyof typeof actorSeverity]++; });
  L.push(`| **Severity Profile** | ${actorSeverity.critical}C / ${actorSeverity.high}H / ${actorSeverity.medium}M / ${actorSeverity.low}L |`);
  L.push("");
  // Activity trend (chronological)
  L.push(`## Activity Timeline — ${actorName} (${actorThreats.length} incidents)`, "");
  L.push("| Date | Victim | Country | Sector | Severity | ATM Tactic | ATM Technique |", "|---|---|---|---|---|---|---|");
  [...actorThreats].sort((a, b) => new Date(a.attackDate).getTime() - new Date(b.attackDate).getTime()).forEach((t) => {
    L.push(`| ${fmtDate(t.attackDate)} | ${t.victimOrg || "—"} | ${t.country || "—"} | ${t.automotiveCategory || "—"} | ${t.severity} | ${t.atmTactic || "—"} | ${t.atmTechnique || "—"} |`);
  });
  L.push("");
  // Attack playbook
  L.push(`## Attack Playbook — ${actorName}`, "");
  L.push("### Preferred ATM Techniques", "");
  L.push("| ATM Tactic | Technique | Uses |", "|---|---|---|");
  const actorTechniques = new Map<string, number>();
  actorThreats.forEach((t) => { if (t.atmTechnique) actorTechniques.set(t.atmTechnique, (actorTechniques.get(t.atmTechnique) || 0) + 1); });
  for (const [tech, count] of topN(actorTechniques, 10)) {
    const tactic = actorThreats.find((t) => t.atmTechnique === tech)?.atmTactic || "—";
    L.push(`| ${tactic} | ${tech} | ${count} |`);
  }
  L.push("");
  L.push("### Behavioral Patterns", "");
  L.push(`- **Primary attack vector:** ${topN(actorTactics, 1)[0]?.[0] || "Unknown"} — observed in ${topN(actorTactics, 1)[0]?.[1] || 0} of ${actorThreats.length} incidents.`);
  L.push(`- **Geographic focus:** ${topN(actorCountries, 3).map(([c, n]) => `${c} (${n})`).join(", ") || "Unknown"}.`);
  const actorSectors = new Map<string, number>();
  actorThreats.forEach((t) => { if (t.automotiveCategory) actorSectors.set(t.automotiveCategory, (actorSectors.get(t.automotiveCategory) || 0) + 1); });
  L.push(`- **Targeted sectors:** ${topN(actorSectors, 5).map(([s, n]) => `${s} (${n})`).join(", ") || "Unknown"}.`);
  L.push(`- **Severity bias:** ${actorSeverity.critical + actorSeverity.high} of ${actorThreats.length} incidents are critical/high severity (${actorThreats.length ? Math.round(((actorSeverity.critical + actorSeverity.high) / actorThreats.length) * 100) : 0}%).`);
  L.push("");
  // Diamond Model (actor-centric)
  L.push(`## Diamond Model — ${actorName}`, "");
  L.push("| Dimension | Details |", "|---|---|");
  L.push(`| **Adversary** | ${actorName} — ${actorThreats.length} attributed incidents in the last ${days} days. |`);
  L.push(`| **Infrastructure** | Tor hidden-service leak sites, dark-web forums for data publication and negotiation. |`);
  L.push(`| **Victim** | ${actorCountries.size} countries: ${topN(actorCountries, 5).map(([c, n]) => `${c} (${n})`).join(", ") || "Unknown"}. Sectors: ${topN(actorSectors, 3).map(([s, n]) => `${s} (${n})`).join(", ") || "Unknown"}. |`);
  L.push(`| **Capabilities** | ${topN(actorTactics, 5).map(([t, n]) => `${t} (${n})`).join(", ") || "N/A"}. Techniques: ${topN(actorTechniques, 5).map(([t, n]) => `${t} (${n})`).join(", ") || "N/A"}. |`);
  L.push("");
  // Actor-specific recommendations
  L.push(`## Defensive Actions Against ${actorName}`, "");
  L.push(`1. **Block & hunt:** Search environment for ${actorName}'s known victim-org patterns, leaked data, and infrastructure indicators.`);
  L.push(`2. **Prioritize:** ${topN(actorSectors, 1)[0]?.[0] || "automotive"} sector assets — this actor's primary target.`);
  L.push(`3. **Detect:** Build VSOC detection rules for ${topN(actorTechniques, 3).map(([t]) => t).join(", ") || "known actor techniques"}.`);
  L.push(`4. **Monitor:** Track ${actorName}'s leak site for new victim announcements; set up dark-web alerts for your org name.`);
  L.push(`5. **Prepare:** Review incident-response playbooks for ${topN(actorTactics, 1)[0]?.[0] || "initial access"} scenarios.`);
  L.push("");
  return L;
}

// Multi-actor profile: covers ALL actors when "all actors" is selected.
// Produces an overview comparison + per-actor mini-profiles + cross-actor analysis.
function buildMultiActorProfile(threats: any[], days: number, s: ThreatStats): string[] {
  const L: string[] = [];
  const actorList = topN(s.byActor, 50); // all actors, sorted by incident count
  L.push("## Actor Landscape Overview", "");
  L.push(`This report profiles **all ${actorList.length} threat actor${actorList.length === 1 ? "" : "s"}** active in the last **${days} days** (${fmtDate(s.dateRange.oldest)} → ${fmtDate(s.dateRange.newest)}). A total of **${s.total}** attributed incidents are analyzed across these actors.`, "");
  L.push("| Field | Value |", "|---|---|");
  L.push(...buildTimeRangeBlock(days, s));
  L.push(`| **Total Actors** | ${actorList.length} |`);
  L.push(`| **Total Attributed Incidents** | ${s.total} |`);
  L.push(`| **Most Active Actor** | ${actorList[0]?.[0] || "—"} (${actorList[0]?.[1] || 0} incidents) |`);
  L.push(`| **Countries Affected** | ${s.byCountry.size} |`);
  L.push(`| **Sectors Targeted** | ${s.byCategory.size} |`);
  L.push("");

  // Comparative actor summary table
  L.push("## Comparative Actor Summary", "");
  L.push("| # | Actor | Incidents | % of Total | Countries | Top Sector | Preferred Tactic | Severity (C/H/M/L) | First Seen | Last Seen |", "|---|---|---|---|---|---|---|---|---|---|");
  actorList.forEach(([actor, count], i) => {
    const at = threats.filter((t) => t.actor === actor);
    const countries = new Set(at.map((t) => t.country).filter(Boolean)).size;
    const sectors = new Map<string, number>();
    at.forEach((t) => { if (t.automotiveCategory) sectors.set(t.automotiveCategory, (sectors.get(t.automotiveCategory) || 0) + 1); });
    const topSector = topN(sectors, 1)[0]?.[0] || "—";
    const tactics = new Map<string, number>();
    at.forEach((t) => { if (t.atmTactic) tactics.set(t.atmTactic, (tactics.get(t.atmTactic) || 0) + 1); });
    const topTactic = topN(tactics, 1)[0]?.[0] || "—";
    const sev = { critical: 0, high: 0, medium: 0, low: 0 };
    at.forEach((t) => { sev[t.severity as keyof typeof sev]++; });
    const firstSeen = at.length ? fmtDate(at.reduce((min, t) => t.attackDate < min.attackDate ? t : min).attackDate) : "—";
    const lastSeen = at.length ? fmtDate(at.reduce((max, t) => t.attackDate > max.attackDate ? t : max).attackDate) : "—";
    L.push(`| ${i + 1} | ${actor} | ${count} | ${Math.round((count / s.total) * 100)}% | ${countries} | ${topSector} | ${topTactic} | ${sev.critical}/${sev.high}/${sev.medium}/${sev.low} | ${firstSeen} | ${lastSeen} |`);
  });
  L.push("");

  // Per-actor mini-profiles
  L.push("## Per-Actor Profiles", "");
  L.push(`Each actor is profiled below with their activity timeline, attack playbook, and diamond model.`, "");
  for (const [actorName, count] of actorList) {
    const at = threats.filter((t) => t.actor === actorName);
    const actorCountries = new Map<string, number>();
    at.forEach((t) => { if (t.country) actorCountries.set(t.country, (actorCountries.get(t.country) || 0) + 1); });
    const actorTactics = new Map<string, number>();
    at.forEach((t) => { if (t.atmTactic) actorTactics.set(t.atmTactic, (actorTactics.get(t.atmTactic) || 0) + 1); });
    const actorTechniques = new Map<string, number>();
    at.forEach((t) => { if (t.atmTechnique) actorTechniques.set(t.atmTechnique, (actorTechniques.get(t.atmTechnique) || 0) + 1); });
    const actorSectors = new Map<string, number>();
    at.forEach((t) => { if (t.automotiveCategory) actorSectors.set(t.automotiveCategory, (actorSectors.get(t.automotiveCategory) || 0) + 1); });
    const sev = { critical: 0, high: 0, medium: 0, low: 0 };
    at.forEach((t) => { sev[t.severity as keyof typeof sev]++; });

    L.push(`### ${actorName} — ${count} incident${count === 1 ? "" : "s"}`, "");
    L.push("| Attribute | Value |", "|---|---|");
    L.push(`| **Incidents** | ${count} |`);
    L.push(`| **First Seen** | ${fmtDate(at.length ? at.reduce((min, t) => t.attackDate < min.attackDate ? t : min).attackDate : null)} |`);
    L.push(`| **Last Seen** | ${fmtDate(at.length ? at.reduce((max, t) => t.attackDate > max.attackDate ? t : max).attackDate : null)} |`);
    L.push(`| **Countries Targeted** | ${actorCountries.size} (${topN(actorCountries, 5).map(([c, n]) => `${c} (${n})`).join(", ") || "—"}) |`);
    L.push(`| **Preferred Tactic** | ${topN(actorTactics, 1)[0]?.[0] || "—"} |`);
    L.push(`| **Top Technique** | ${topN(actorTechniques, 1)[0]?.[0] || "—"} |`);
    L.push(`| **Top Sector** | ${topN(actorSectors, 1)[0]?.[0] || "—"} |`);
    L.push(`| **Severity** | ${sev.critical}C / ${sev.high}H / ${sev.medium}M / ${sev.low}L |`);
    L.push("");
    // Incident timeline for this actor
    L.push(`**Incident Timeline:**`, "");
    L.push("| Date | Victim | Country | Sector | Severity | ATM Tactic |", "|---|---|---|---|---|---|");
    [...at].sort((a, b) => new Date(a.attackDate).getTime() - new Date(b.attackDate).getTime()).forEach((t) => {
      L.push(`| ${fmtDate(t.attackDate)} | ${t.victimOrg || "—"} | ${t.country || "—"} | ${t.automotiveCategory || "—"} | ${t.severity} | ${t.atmTactic || "—"} |`);
    });
    L.push("");
    // Diamond model for this actor
    L.push(`**Diamond Model:**`, "");
    L.push("| Dimension | Details |", "|---|---|");
    L.push(`| **Adversary** | ${actorName} — ${count} incidents |`);
    L.push(`| **Infrastructure** | Tor hidden-service leak sites, dark-web forums |`);
    L.push(`| **Victim** | ${topN(actorCountries, 3).map(([c, n]) => `${c} (${n})`).join(", ") || "Unknown"}. Sectors: ${topN(actorSectors, 3).map(([s, n]) => `${s} (${n})`).join(", ") || "Unknown"}. |`);
    L.push(`| **Capabilities** | ${topN(actorTactics, 3).map(([t, n]) => `${t} (${n})`).join(", ") || "N/A"}. |`);
    L.push("");
  }

  // Cross-actor analysis
  L.push("## Cross-Actor Analysis", "");
  L.push("### Shared Tactics Across Actors", "");
  L.push("| ATM Tactic | Actors Using It | Total Incidents |", "|---|---|---|");
  for (const [tactic, count] of topN(s.byTactic, 14)) {
    const actorsUsingTactic = new Set(threats.filter((t) => t.atmTactic === tactic).map((t) => t.actor).filter(Boolean));
    L.push(`| ${tactic} | ${actorsUsingTactic.size} (${[...actorsUsingTactic].slice(0, 5).join(", ")}${actorsUsingTactic.size > 5 ? "…" : ""}) | ${count} |`);
  }
  L.push("");

  L.push("### Shared Sectors Across Actors", "");
  L.push("| Sector | Actors Targeting It | Total Incidents |", "|---|---|---|");
  for (const [sector, count] of topN(s.byCategory, 12)) {
    const actorsTargeting = new Set(threats.filter((t) => t.automotiveCategory === sector).map((t) => t.actor).filter(Boolean));
    L.push(`| ${sector} | ${actorsTargeting.size} (${[...actorsTargeting].slice(0, 5).join(", ")}${actorsTargeting.size > 5 ? "…" : ""}) | ${count} |`);
  }
  L.push("");

  L.push("### Geographic Overlap", "");
  L.push("| Country | Actors Active | Total Incidents |", "|---|---|---|");
  for (const [country, count] of topN(s.byCountry, 15)) {
    const actorsInCountry = new Set(threats.filter((t) => t.country === country).map((t) => t.actor).filter(Boolean));
    L.push(`| ${country} | ${actorsInCountry.size} | ${count} |`);
  }
  L.push("");

  // Cross-actor recommendations
  L.push("## Defensive Recommendations (All Actors)", "");
  L.push(`1. **Prioritize by volume:** ${actorList[0]?.[0] || "the most active actor"} (${actorList[0]?.[1] || 0} incidents) warrants the most immediate defensive attention.`);
  L.push(`2. **Broaden detection:** Deploy VSOC rules for the top shared tactics: ${topN(s.byTactic, 3).map(([t]) => t).join(", ")}.`);
  L.push(`3. **Sector focus:** Harden ${topN(s.byCategory, 3).map(([s]) => s).join(", ")} — the most targeted sectors across all actors.`);
  L.push(`4. **Geographic defense:** Prioritize ${topN(s.byCountry, 3).map(([c]) => c).join(", ")} — the most affected countries.`);
  L.push(`5. **Actor monitoring:** Track all ${actorList.length} actors' leak sites for new victim announcements; set up dark-web alerts for your org name and sector.`);
  L.push(`6. **Intelligence sharing:** Share this multi-actor profile with Auto-ISAC and sector ISAC partners for collective defense against coordinated threat activity.`);
  L.push("");
  return L;
}

function buildIncidentReport(config: ReportConfig, threats: any[], days: number): string[] {
  const t = threats[0];
  const L: string[] = [];
  if (!t) {
    L.push("## Incident Details", "", "**No threat found matching the specified ID.**", "");
    return L;
  }
  L.push("## Incident Details", "");
  L.push("| Field | Value |", "|---|---|");
  L.push(`| **Threat ID** | ${t.id} |`);
  L.push(`| **Title** | ${t.title} |`);
  L.push(`| **Severity** | ${t.severity.toUpperCase()} |`);
  L.push(`| **Attack Date** | ${fmtDate(t.attackDate)} |`);
  L.push(`| **Source** | ${t.sourceName} |`);
  L.push(`| **Source URL** | ${t.sourceUrl || "—"} |`);
  L.push(`| **Threat Actor** | ${t.actor || "Unattributed"} |`);
  L.push(`| **Victim Organization** | ${t.victimOrg || "—"} |`);
  L.push(`| **Victim Country** | ${t.country || "—"} |`);
  L.push(`| **Automotive Sector** | ${t.automotiveCategory || "—"} |`);
  L.push(`| **Relevance Score** | ${t.relevanceScore}/100 |`);
  L.push(`| **Verified** | ${t.verified ? "Yes" : "No"} |`);
  L.push("");
  L.push("## Description", "");
  L.push(t.description || "No description available.");
  L.push("");
  // IoCs
  L.push("## Indicators of Compromise (IoCs)", "");
  if (t.dataTypes) {
    L.push("### Data Types Involved", "");
    L.push("| Data Type |", "|---|");
    t.dataTypes.split(",").forEach((d: string) => L.push(`| ${d.trim()} |`));
    L.push("");
  }
  if (t.sourceUrl) {
    L.push("### Network Indicators", "");
    L.push("| Type | Indicator |", "|---|---|");
    L.push(`| Source URL | ${t.sourceUrl} |`);
    L.push("");
  }
  // ATM mapping for THIS incident
  L.push("## ATM Mapping — This Incident", "");
  L.push("| ATM Tactic | ATM Technique |", "|---|---|");
  L.push(`| ${t.atmTactic || "—"} | ${t.atmTechnique || "—"} |`);
  L.push("");
  // Kill chain reconstruction for THIS incident
  L.push("## Cyber Kill Chain Reconstruction", "");
  L.push("| Stage | Assessment | Evidence |", "|---|---|---|");
  L.push(`| **S1: Reconnaissance** | ${t.actor ? `${t.actor} likely identified ${t.victimOrg || "the victim"} as a target via OSINT/leak-site reconnaissance.` : "Unknown — actor unattributed."} | Target sector: ${t.automotiveCategory || "unknown"} |`);
  L.push(`| **S2: Weaponization** | Adversary prepared ransomware payload / exfiltration tooling. | Inferred from attack pattern |`);
  L.push(`| **S3: Delivery** | Initial access achieved (phishing, supply chain, or exposed service). | Source: ${t.sourceName} |`);
  L.push(`| **S4: Exploitation** | ${t.atmTechnique || "Vulnerability/credential exploitation"} executed. | ATM: ${t.atmTactic || "—"} |`);
  L.push(`| **S5: Installation** | Persistence established on victim network. | Inferred |`);
  L.push(`| **S6: C2** | Command-and-control channel established. | Inferred |`);
  L.push(`| **S7: Actions on Objective** | ${t.severity === "critical" ? "Data exfiltration + ransomware deployment + publication threat." : "Data exfiltration and/or ransomware deployment."} | Victim: ${t.victimOrg || "—"} (${t.country || "—"}) |`);
  L.push("");
  // Diamond Model for THIS incident
  L.push("## Diamond Model — This Incident", "");
  L.push("| Dimension | Details |", "|---|---|");
  L.push(`| **Adversary** | ${t.actor || "Unattributed"} |`);
  L.push(`| **Infrastructure** | ${t.sourceUrl?.includes(".onion") ? "Tor hidden service" : t.sourceUrl || "Dark-web leak site"} |`);
  L.push(`| **Victim** | ${t.victimOrg || "—"} (${t.country || "—"}, ${t.automotiveCategory || "—"}) |`);
  L.push(`| **Capability** | ${t.atmTactic || "—"}: ${t.atmTechnique || "—"} |`);
  L.push("");
  // Risk assessment for THIS incident
  L.push("## Incident Risk Assessment", "");
  L.push("| Factor | Assessment |", "|---|---|");
  const risk = t.severity === "critical" ? "Critical" : t.severity === "high" ? "High" : t.severity === "medium" ? "Medium" : "Low";
  L.push(`| **Severity** | ${risk} |`);
  L.push(`| **Likelihood of Impact** | ${t.severity === "critical" || t.severity === "high" ? "High — active exploitation" : "Moderate"} |`);
  L.push(`| **Automotive Relevance** | ${t.relevanceScore}/100 (confidence ${t.relevanceScore >= 85 ? "high" : t.relevanceScore >= 70 ? "medium" : "low"}) |`);
  L.push("");
  // Related threats (same actor or same tactic)
  const related = threats.filter((x) => x.id !== t.id && (x.actor === t.actor || x.atmTactic === t.atmTactic)).slice(0, 10);
  L.push("## Related Threats", "");
  if (related.length === 0) {
    L.push("- No related threats found in this dataset.");
  } else {
    L.push("| Date | Title | Actor | Shared Attribute |", "|---|---|---|---|");
    related.forEach((r) => {
      const shared = r.actor === t.actor ? `Same actor (${r.actor})` : `Same tactic (${r.atmTactic})`;
      L.push(`| ${fmtDate(r.attackDate)} | ${String(r.title).slice(0, 50)} | ${r.actor || "—"} | ${shared} |`);
    });
  }
  L.push("");
  // Immediate actions
  L.push("## Immediate Recommended Actions", "");
  L.push(`1. **Assess exposure:** Determine if ${t.victimOrg || "your organization"} matches the victim profile.`);
  L.push(`2. **Hunt for IOCs:** Search for ${t.actor || "threat actor"} indicators, source URLs, and data-type patterns in your environment.`);
  L.push(`3. **Contain:** If related activity is found, isolate affected systems and activate incident response.`);
  L.push(`4. **Patch:** Address any ${t.atmTechnique || "exploited"} vulnerabilities in your automotive infrastructure.`);
  L.push(`5. **Report:** Escalate to VSOC lead and Auto-ISAC if the incident impacts your organization.`);
  L.push("");
  return L;
}

function buildCampaignAnalysis(config: ReportConfig, threats: any[], days: number): string[] {
  const s = computeStats(threats);
  const filterLabel = config.campaignFilterValue
    ? `${config.campaignFilter}: ${config.campaignFilterValue}`
    : `all threats (last ${days} days)`;
  const L: string[] = [];
  L.push("## Campaign Overview", "");
  L.push(`This campaign analysis covers **${s.total}** threats filtered by **${filterLabel}**. The campaign spans ${fmtDate(s.dateRange.oldest)} → ${fmtDate(s.dateRange.newest)}.`, "");
  L.push("| Field | Value |", "|---|---|");
  L.push(...buildTimeRangeBlock(days, s));
  L.push(`| **Campaign Filter** | ${filterLabel} |`);
  L.push(`| **Unique Actors** | ${s.actors.size} |`);
  L.push(`| **Victims** | ${new Set(threats.map((t) => t.victimOrg).filter(Boolean)).size} |`);
  L.push("");
  // Chronological timeline
  L.push("## Campaign Timeline (Chronological)", "");
  L.push("| # | Date | Actor | Victim | Country | Sector | Severity | ATM Tactic |", "|---|---|---|---|---|---|---|---|");
  s.sortedByDate.slice().reverse().forEach((t, i) => {
    L.push(`| ${i + 1} | ${fmtDate(t.attackDate)} | ${t.actor || "—"} | ${t.victimOrg || "—"} | ${t.country || "—"} | ${t.automotiveCategory || "—"} | ${t.severity} | ${t.atmTactic || "—"} |`);
  });
  L.push("");
  // Common techniques across the campaign
  L.push("## Common Techniques Across Campaign", "");
  L.push("| ATM Tactic | ATM Technique | Occurrences | % of Campaign |", "|---|---|---|---|");
  for (const [tactic, count] of topN(s.byTactic, 10)) {
    const techs = new Map<string, number>();
    threats.filter((t) => t.atmTactic === tactic).forEach((t) => { if (t.atmTechnique) techs.set(t.atmTechnique, (techs.get(t.atmTechnique) || 0) + 1); });
    const topTech = topN(techs, 1)[0];
    L.push(`| ${tactic} | ${topTech?.[0] || "—"} | ${count} | ${Math.round((count / s.total) * 100)}% |`);
  }
  L.push("");
  // Victim overlap
  L.push("## Victim Overlap Analysis", "");
  const victimMap = new Map<string, number>();
  threats.forEach((t) => { if (t.victimOrg) victimMap.set(t.victimOrg, (victimMap.get(t.victimOrg) || 0) + 1); });
  L.push("| Victim | Incidents |", "|---|---|");
  for (const [victim, count] of topN(victimMap, 15)) L.push(`| ${victim} | ${count} |`);
  L.push("");
  // Kill chain comparison
  L.push("## Kill Chain Comparison Across Incidents", "");
  L.push("| Stage | Pattern Observed |", "|---|---|");
  L.push(`| **Reconnaissance** | ${s.byCategory.size} distinct sectors targeted — ${topN(s.byCategory, 1)[0]?.[0] || "unknown"} is the most targeted. |`);
  L.push(`| **Delivery** | ${s.byActor.size} actor(s) involved; ${topN(s.byActor, 1)[0]?.[0] || "unattributed"} is the most active. |`);
  L.push(`| **Exploitation** | ${topN(s.byTactic, 1)[0]?.[0] || "—"} is the dominant tactic (${topN(s.byTactic, 1)[0]?.[1] || 0} of ${s.total} incidents). |`);
  L.push(`| **C2** | Dark-web leak sites used for communication/data publication. |`);
  L.push(`| **Actions on Objective** | ${s.bySeverity.critical + s.bySeverity.high} of ${s.total} incidents reached high/critical impact. |`);
  L.push("");
  // Campaign impact
  L.push("## Campaign Impact Assessment", "");
  L.push("| Metric | Value |", "|---|---|");
  L.push(`| **Total Incidents** | ${s.total} |`);
  L.push(`| **Critical/High Severity** | ${s.bySeverity.critical + s.bySeverity.high} (${s.total ? Math.round(((s.bySeverity.critical + s.bySeverity.high) / s.total) * 100) : 0}%) |`);
  L.push(`| **Countries Affected** | ${s.byCountry.size} |`);
  L.push(`| **Sectors Affected** | ${s.byCategory.size} |`);
  L.push(`| **Campaign Duration** | ${s.dateRange.oldest && s.dateRange.newest ? Math.max(1, Math.ceil((new Date(s.dateRange.newest).getTime() - new Date(s.dateRange.oldest).getTime()) / 86400000) + 1) : 0} days |`);
  L.push(`| **Peak Activity** | ${fmtDate(s.dateRange.newest)} |`);
  L.push("");
  // Intel breakdown
  L.push("## Intelligence Breakdown", "");
  L.push("### STRATEGIC", "");
  L.push(`**Audience:** C-suite, VSOC Leadership — This campaign involves ${s.actors.size} actor(s) targeting ${s.byCategory.size} automotive sectors across ${s.byCountry.size} countries. Strategic implication: ${s.bySeverity.critical + s.bySeverity.high > 5 ? "elevated threat to automotive supply chain" : "moderate, targeted threat activity"}.`);
  L.push("");
  L.push("### OPERATIONAL", "");
  L.push(`**Audience:** VSOC Managers — Coordinate hunting efforts across ${s.byCountry.size} countries. Prioritize ${topN(s.byCategory, 3).map(([c]) => c).join(", ") || "affected"} sectors. Monitor ${topN(s.byActor, 3).map(([a]) => a).join(", ") || "active actors"} for continued activity.`);
  L.push("");
  L.push("### TACTICAL", "");
  L.push(`**Audience:** SOC Analysts — Deploy detections for ${topN(s.byTechnique, 5).map(([t]) => t).join(", ") || "observed techniques"}. Hunt for ${topN(s.byActor, 1)[0]?.[0] || "actor"} indicators in environment.`);
  L.push("");
  return L;
}

function buildSectorAssessment(config: ReportConfig, threats: any[], days: number): string[] {
  const s = computeStats(threats);
  // Derive the sector name from the actual threats (when "all" was selected,
  // gatherThreats auto-selected the most-targeted sector, so the threats are
  // already filtered to that sector).
  const derivedSector = topN(s.byCategory, 1)[0]?.[0];
  const sectorName = (config.sector && config.sector !== "all")
    ? config.sector
    : (derivedSector ?? "automotive");
  const sectorThreats = threats.filter((t) => t.automotiveCategory === sectorName);
  const L: string[] = [];
  L.push(`## Sector Assessment: ${sectorName}`, "");
  L.push(`This assessment evaluates **${sectorThreats.length}** threats targeting the **${sectorName}** sector over the last **${days} days** (${fmtDate(s.dateRange.oldest)} → ${fmtDate(s.dateRange.newest)}).`, "");
  L.push("| Field | Value |", "|---|---|");
  L.push(`| **Sector** | ${sectorName} |`);
  L.push(...buildTimeRangeBlock(days, s));
  L.push(`| **Sector Threats** | ${sectorThreats.length} |`);
  const sectorActors = new Set(sectorThreats.map((t) => t.actor).filter(Boolean));
  L.push(`| **Active Actors** | ${sectorActors.size} |`);
  const sectorCountries = new Set(sectorThreats.map((t) => t.country).filter(Boolean));
  L.push(`| **Countries Affected** | ${sectorCountries.size} |`);
  const sectorSeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  sectorThreats.forEach((t) => { sectorSeverity[t.severity as keyof typeof sectorSeverity]++; });
  L.push(`| **Severity (sector)** | ${sectorSeverity.critical}C / ${sectorSeverity.high}H / ${sectorSeverity.medium}M / ${sectorSeverity.low}L |`);
  L.push("");
  // All threats in this sector
  L.push(`### All ${sectorName} Sector Threats (${sectorThreats.length})`, "");
  L.push("| # | Date | Title | Severity | Actor | Victim | Country | ATM Tactic |", "|---|---|---|---|---|---|---|---|");
  sectorThreats.sort((a, b) => new Date(b.attackDate).getTime() - new Date(a.attackDate).getTime()).forEach((t, i) => {
    L.push(`| ${i + 1} | ${fmtDate(t.attackDate)} | ${String(t.title).slice(0, 50)} | ${t.severity} | ${t.actor || "—"} | ${t.victimOrg || "—"} | ${t.country || "—"} | ${t.atmTactic || "—"} |`);
  });
  L.push("");
  // Top actors against this sector
  L.push(`## Top Threat Actors Targeting ${sectorName}`, "");
  const sectorActorMap = new Map<string, number>();
  sectorThreats.forEach((t) => { if (t.actor) sectorActorMap.set(t.actor, (sectorActorMap.get(t.actor) || 0) + 1); });
  if (sectorActorMap.size === 0) { L.push("- No actors attributed."); }
  else {
    L.push("| Actor | Incidents | Primary Tactic |", "|---|---|---|");
    for (const [actor, count] of topN(sectorActorMap, 10)) {
      const tactic = topN(new Map(sectorThreats.filter((t) => t.actor === actor).map((t) => [t.atmTactic || "—", 1])), 1)[0]?.[0] || "—";
      L.push(`| ${actor} | ${count} | ${tactic} |`);
    }
  }
  L.push("");
  // Most common tactics used against this sector
  L.push(`## Common Attack Tactics Against ${sectorName}`, "");
  const sectorTactics = new Map<string, number>();
  sectorThreats.forEach((t) => { if (t.atmTactic) sectorTactics.set(t.atmTactic, (sectorTactics.get(t.atmTactic) || 0) + 1); });
  L.push("| ATM Tactic | Count | % of Sector | Top Technique |", "|---|---|---|---|");
  for (const [tactic, count] of topN(sectorTactics, 14)) {
    const techs = sectorThreats.filter((t) => t.atmTactic === tactic).map((t) => t.atmTechnique).filter(Boolean);
    L.push(`| ${tactic} | ${count} | ${Math.round((count / sectorThreats.length) * 100)}% | ${[...new Set(techs)][0] || "—"} |`);
  }
  L.push("");
  // Geographic distribution of sector victims
  L.push(`## Geographic Distribution of ${sectorName} Victims`, "");
  const sectorCountryMap = new Map<string, number>();
  sectorThreats.forEach((t) => { if (t.country) sectorCountryMap.set(t.country, (sectorCountryMap.get(t.country) || 0) + 1); });
  L.push("| Country | Victims |", "|---|---|");
  for (const [country, count] of topN(sectorCountryMap, 15)) L.push(`| ${country} | ${count} |`);
  L.push("");
  // Data types exfiltrated
  L.push("## Data Types Observed in Sector Breaches", "");
  const sectorDataTypes = new Set<string>();
  sectorThreats.forEach((t) => { if (t.dataTypes) t.dataTypes.split(",").forEach((d: string) => sectorDataTypes.add(d.trim())); });
  if (sectorDataTypes.size > 0) {
    L.push("| Data Type |", "|---|");
    for (const dt of [...sectorDataTypes].slice(0, 15)) L.push(`| ${dt} |`);
  } else {
    L.push("- No specific data types catalogued for this sector.");
  }
  L.push("");
  // Sector-specific recommendations
  L.push(`## Strategic Recommendations for ${sectorName} Sector Defense`, "");
  L.push(`1. **Sector-specific hunting:** Deploy detection rules targeting ${topN(sectorTactics, 3).map(([t]) => t).join(", ") || "observed tactics"} in ${sectorName} infrastructure.`);
  L.push(`2. **Actor monitoring:** Track ${topN(sectorActorMap, 3).map(([a]) => a).join(", ") || "active actors"} for continued targeting of ${sectorName} organizations.`);
  L.push(`3. **Geographic focus:** Prioritize defenses in ${topN(sectorCountryMap, 3).map(([c]) => c).join(", ") || "affected countries"} where ${sectorName} victims are concentrated.`);
  L.push(`4. **Data protection:** Implement extra controls around ${[...sectorDataTypes].slice(0, 3).join(", ") || "sensitive automotive data"} — the primary exfiltration targets.`);
  L.push(`5. **Information sharing:** Share ${sectorName}-sector IOCs with Auto-ISAC and sector ISAC partners for collective defense.`);
  L.push("");
  return L;
}

function buildAdHocReport(config: ReportConfig, threats: any[], days: number): string[] {
  const s = computeStats(threats);
  const L: string[] = [];
  L.push("## Analyst-Selected Threat Analysis", "");
  L.push(`This ad-hoc report covers **${threats.length}** manually selected threats. The analyst has chosen these threats for cross-analysis based on shared characteristics, patterns, or investigative interest.`, "");
  L.push("| Field | Value |", "|---|---|");
  L.push(`| **Selected Threats** | ${threats.length} |`);
  L.push(`| **Date Range** | ${fmtDate(s.dateRange.oldest)} → ${fmtDate(s.dateRange.newest)} |`);
  L.push(`| **Unique Actors** | ${s.actors.size} |`);
  L.push(`| **Countries** | ${s.byCountry.size} |`);
  L.push(`| **Sectors** | ${s.byCategory.size} |`);
  L.push("");
  // All selected threats
  L.push("### Selected Threats", "");
  L.push("| # | Date | Title | Severity | Actor | Victim | Sector | ATM Tactic |", "|---|---|---|---|---|---|---|---|");
  s.sortedByDate.forEach((t, i) => {
    L.push(`| ${i + 1} | ${fmtDate(t.attackDate)} | ${String(t.title).slice(0, 50)} | ${t.severity} | ${t.actor || "—"} | ${t.victimOrg || "—"} | ${t.automotiveCategory || "—"} | ${t.atmTactic || "—"} |`);
  });
  L.push("");
  // Cross-threat analysis: shared techniques
  L.push("## Cross-Threat Analysis: Shared Techniques", "");
  L.push("| ATM Tactic | Technique | Threats Using It |", "|---|---|---|");
  for (const [tactic, count] of topN(s.byTactic, 10)) {
    const techs = new Map<string, number>();
    threats.filter((t) => t.atmTactic === tactic).forEach((t) => { if (t.atmTechnique) techs.set(t.atmTechnique, (techs.get(t.atmTechnique) || 0) + 1); });
    L.push(`| ${tactic} | ${topN(techs, 1)[0]?.[0] || "—"} | ${count} |`);
  }
  L.push("");
  // Shared actors
  L.push("## Cross-Threat Analysis: Shared Actors", "");
  if (s.byActor.size === 0) {
    L.push("- No actors attributed across the selected threats.");
  } else {
    L.push("| Actor | Threats | Shared Targets |", "|---|---|---|");
    for (const [actor, count] of topN(s.byActor, 10)) {
      const actorThreats = threats.filter((t) => t.actor === actor);
      const targets = [...new Set(actorThreats.map((t) => t.victimOrg).filter(Boolean))].slice(0, 3).join(", ");
      L.push(`| ${actor} | ${count} | ${targets || "—"} |`);
    }
  }
  L.push("");
  // Shared victims/sectors
  L.push("## Cross-Threat Analysis: Shared Sectors", "");
  if (s.byCategory.size === 0) {
    L.push("- No sector data across selected threats.");
  } else {
    L.push("| Sector | Threats |", "|---|---|");
    for (const [sector, count] of topN(s.byCategory, 10)) L.push(`| ${sector} | ${count} |`);
  }
  L.push("");
  // Analyst notes
  L.push("## Analyst Notes", "");
  L.push(`- **Selection rationale:** ${threats.length} threat${threats.length === 1 ? "" : "s"} selected for cross-analysis.`);
  L.push(`- **Common patterns:** ${topN(s.byTactic, 1)[0] ? `Most shared tactic is ${topN(s.byTactic, 1)[0][0]} (${topN(s.byTactic, 1)[0][1]} threats).` : "No common tactics identified."}`);
  L.push(`- **Actor overlap:** ${s.actors.size} unique actor${s.actors.size === 1 ? "" : "s"} across the selection${s.actors.size > 0 ? `; ${topN(s.byActor, 1)[0]?.[0]} appears in ${topN(s.byActor, 1)[0]?.[1]} threat${topN(s.byActor, 1)[0]?.[1] === 1 ? "" : "s"}.` : "."}`);
  L.push(`- **Temporal clustering:** Threats span ${s.dateRange.oldest && s.dateRange.newest ? Math.max(1, Math.ceil((new Date(s.dateRange.newest).getTime() - new Date(s.dateRange.oldest).getTime()) / 86400000) + 1) : 0} days.`);
  L.push(`- **Severity distribution:** ${s.bySeverity.critical} critical, ${s.bySeverity.high} high, ${s.bySeverity.medium} medium, ${s.bySeverity.low} low.`);
  L.push("");
  return L;
}

// ---- Dispatcher: routes to the type-specific builder ----

export function buildTemplateReport(config: ReportConfig, threats: any[], days: number): string {
  const meta = REPORT_TYPE_META[config.type];
  const reportId = `CARTINT-CTI-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const priority = config.priority || "High";
  const tlp = config.tlp || "TLP:AMBER";
  const company = config.companyName || "[Organization Name Withheld]";
  const titleSuffix = config.type === "weekly-digest"
    ? `${days}d`
    : config.type === "threat-actor-profile"
    ? (config.threatActor && config.threatActor !== "all" ? config.threatActor : `all actors`)
    : config.type === "sector-assessment"
    ? (config.sector && config.sector !== "all" ? config.sector : `all sectors`)
    : `${days}d`;
  const subtitle = config.type === "threat-actor-profile"
    ? (config.threatActor && config.threatActor !== "all"
      ? `Focused profile of threat actor: ${config.threatActor}`
      : `Comparative profile of ALL threat actors active in the window`)
    : config.type === "sector-assessment"
    ? (config.sector && config.sector !== "all"
      ? `Sector-focused assessment: ${config.sector}`
      : `Sector assessment of the most-targeted sector`)
    : config.type === "incident-report"
    ? `Single-incident deep-dive analysis`
    : config.type === "campaign-analysis"
    ? `Campaign analysis filtered by ${config.campaignFilter || "actor"}${config.campaignFilterValue ? `: ${config.campaignFilterValue}` : ""}`
    : config.type === "ad-hoc"
    ? `Analyst-selected threats for cross-analysis`
    : `Automotive threat summary for the last ${days} days`;

  const lines: string[] = [];
  lines.push(...buildHeader(meta, subtitle));
  lines.push(...buildMetadataTable(meta, reportId, date, priority, tlp, company, `${meta.title} — ${titleSuffix || subtitle}`));
  lines.push("## Intelligence Requirements Addressed", "");
  lines.push(`1. **IR-01:** What threats are targeting the automotive sector in the last ${days} days?`);
  lines.push(`2. **IR-02:** What automotive-specific data types are being exfiltrated and sold?`);
  lines.push(`3. **IR-03:** What Auto-ISAC ATM techniques are being used against connected-vehicle infrastructure?`);
  lines.push("");

  // Type-specific body — each builder produces a DISTINCT structure
  switch (config.type) {
    case "weekly-digest":
      lines.push(...buildWeeklyDigest(config, threats, days));
      break;
    case "threat-actor-profile":
      lines.push(...buildThreatActorProfile(config, threats, days));
      break;
    case "incident-report":
      lines.push(...buildIncidentReport(config, threats, days));
      break;
    case "campaign-analysis":
      lines.push(...buildCampaignAnalysis(config, threats, days));
      break;
    case "sector-assessment":
      lines.push(...buildSectorAssessment(config, threats, days));
      break;
    case "ad-hoc":
    default:
      lines.push(...buildAdHocReport(config, threats, days));
      break;
  }

  lines.push(...buildDistribution(tlp));
  lines.push(...buildGlossary());
  lines.push(...buildFooter());
  return lines.join("\n");
}

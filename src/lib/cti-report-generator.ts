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
// Each report is generated via LLM with a structured prompt based on the
// CARTINT CTI Report Template, falling back to a template generator on
// content-filter errors.

import ZAI from "z-ai-web-dev-sdk";
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

const REPORT_TYPE_META: Record<ReportType, { title: string; defaultDays: number }> = {
  "weekly-digest": { title: "Weekly Threat Digest", defaultDays: 7 },
  "threat-actor-profile": { title: "Threat Actor Profile", defaultDays: 30 },
  "incident-report": { title: "Incident Report", defaultDays: 30 },
  "campaign-analysis": { title: "Campaign Analysis", defaultDays: 14 },
  "sector-assessment": { title: "Sector Threat Assessment", defaultDays: 30 },
  "ad-hoc": { title: "Ad-Hoc Report", defaultDays: 30 },
};

let zaiPromise: Promise<unknown> | null = null;
async function getZai() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

export async function generateCtiReport(config: ReportConfig): Promise<GeneratedReport> {
  const meta = REPORT_TYPE_META[config.type];
  const days = config.timeRangeDays || meta.defaultDays;
  const since = new Date(Date.now() - days * 86400000);

  // Gather threat data based on report type
  const threats = await gatherThreats(config, since);

  // Build the LLM prompt
  const prompt = buildReportPrompt(config, threats, days);

  let content = "";
  let method: "llm" | "template" = "llm";

  // Server-side LLM timeout: race the LLM call against a hard deadline.
  // If the LLM exceeds LLM_TIMEOUT_MS (30s), we fall back to the template
  // report so the analyst ALWAYS gets output instead of a timeout error.
  const LLM_TIMEOUT_MS = 30_000;
  try {
    const zai = (await getZai()) as Awaited<ReturnType<typeof ZAI.create>>;
    const llmPromise = zai.chat.completions.create({
      messages: [
        { role: "assistant", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM_TIMEOUT")), LLM_TIMEOUT_MS),
    );
    const completion = (await Promise.race([llmPromise, timeoutPromise])) as {
      choices?: { message?: { content?: string } }[];
    };
    content = completion.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      // Empty LLM output — fall back to template so we never return a blank report.
      content = buildTemplateReport(config, threats, days);
      method = "template";
    }
  } catch (err) {
    // ANY error (content-filter, timeout, network, malformed response) falls back
    // to the deterministic template report. The user always gets a usable report.
    const isTimeout =
      err instanceof Error &&
      (err.message === "LLM_TIMEOUT" ||
        /timeout|abort|timed?\s*out/i.test(err.message));
    if (isTimeout || isContentFilterError(err)) {
      console.warn(
        `[cti-report] LLM ${isTimeout ? "timed out" : "content-filtered"}, using template fallback.`,
      );
    } else {
      console.warn("[cti-report] LLM call failed, using template fallback:", err);
    }
    content = buildTemplateReport(config, threats, days);
    method = "template";
  }

  const reportId = `CARTINT-CTI-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const title = `${meta.title} — ${config.type === "weekly-digest" ? `${days}d` : config.threatActor || config.sector || `${days}d`} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

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
async function gatherThreats(config: ReportConfig, since: Date) {
  const accepted = {
    isAutomotive: true,
    relevanceScore: { gte: RELEVANCE_THRESHOLD },
  } as const;

  switch (config.type) {
    case "incident-report": {
      if (!config.singleThreatId) return [];
      return db.threat.findMany({ where: { id: config.singleThreatId, ...accepted } });
    }
    case "threat-actor-profile": {
      return db.threat.findMany({
        where: { ...accepted, actor: config.threatActor || undefined, attackDate: { gte: since } },
        orderBy: { attackDate: "desc" }, take: 50,
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
      return db.threat.findMany({
        where: { ...accepted, automotiveCategory: config.sector || undefined, attackDate: { gte: since } },
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

// Build the LLM prompt for report generation
function buildReportPrompt(config: ReportConfig, threats: any[], days: number) {
  const meta = REPORT_TYPE_META[config.type];
  const sections = config.sections || [
    "Threat Overview", "Adversary Interest Analysis", "Intelligence Levels",
    "Diamond Model", "Cyber Kill Chain", "ATM Mapping", "Collection Methodology",
    "Artifacts", "Risk Assessment", "Source Reliability", "Recommendations",
    "Distribution", "Glossary",
  ];

  // Cap the number of threats sent to the LLM and trim each one to the
  // essential fields (drop long descriptions) to keep the prompt small.
  // The full threat set is still used for the template fallback + metadata.
  const MAX_LLM_THREATS = 25;
  const llmThreats = threats.slice(0, MAX_LLM_THREATS);
  const threatData = llmThreats.map((t) => ({
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
  // mapped tactic/technique names, so the LLM doesn't need the full taxonomy.
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

${threats.length > MAX_LLM_THREATS ? `NOTE: ${threats.length} threats matched but only the ${MAX_LLM_THREATS} most recent are included below. Aggregate counts should reflect ALL ${threats.length} where possible.` : ""}

Output ONLY the Markdown report.`;

  const userPrompt = `Generate the ${meta.title}.

Report Type: ${config.type}
Time Range: Last ${days} days
Total threats matched: ${threats.length} (showing ${llmThreats.length})
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
      return `- Actor name, first seen, activity trend
- All threats attributed to this actor (with ATM mappings)
- Diamond Model analysis (Adversary/Infrastructure/Victim/Capabilities)
- Attack playbook (behavioral patterns, preferred ATM techniques)
- Recommended defensive actions against this actor`;
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

// Template-based fallback report (no LLM)
function buildTemplateReport(config: ReportConfig, threats: any[], days: number): string {
  const meta = REPORT_TYPE_META[config.type];
  const reportId = `CARTINT-CTI-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const priority = config.priority || "High";
  const tlp = config.tlp || "TLP:AMBER";
  const company = config.companyName || "[Organization Name Withheld]";

  // Aggregate stats
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byActor = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byTactic = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  const actors = new Set<string>();
  const dataTypes = new Set<string>();

  for (const t of threats) {
    bySeverity[t.severity as keyof typeof bySeverity]++;
    if (t.actor) { byActor.set(t.actor, (byActor.get(t.actor) || 0) + 1); actors.add(t.actor); }
    if (t.country) byCountry.set(t.country, (byCountry.get(t.country) || 0) + 1);
    if (t.atmTactic) byTactic.set(t.atmTactic, (byTactic.get(t.atmTactic) || 0) + 1);
    if (t.automotiveCategory) byCategory.set(t.automotiveCategory, (byCategory.get(t.automotiveCategory) || 0) + 1);
    bySource.set(t.sourceName, (bySource.get(t.sourceName) || 0) + 1);
    if (t.dataTypes) t.dataTypes.split(",").forEach((d: string) => dataTypes.add(d.trim()));
  }

  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const lines: string[] = [];
  lines.push(`# ${meta.title}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Report Metadata");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| **Report ID** | ${reportId} |`);
  lines.push(`| **Date** | ${date} |`);
  lines.push(`| **Priority** | ${priority} |`);
  lines.push(`| **Source & Information Reliability** | B-2 (Usually reliable / Probably true) |`);
  lines.push(`| **Sensitivity** | ${tlp} |`);
  lines.push(`| **Company Name** | ${company} |`);
  lines.push(`| **Report Title** | ${meta.title} — ${config.threatActor || config.sector || `${days}d window`} |`);
  lines.push("");
  lines.push("## Intelligence Requirements Addressed");
  lines.push("");
  lines.push(`1. **IR-01:** What threats are targeting the automotive sector in the last ${days} days?`);
  lines.push(`2. **IR-02:** What automotive-specific data types are being exfiltrated and sold?`);
  lines.push(`3. **IR-03:** What Auto-ISAC ATM techniques are being used against connected-vehicle infrastructure?`);
  lines.push("");
  lines.push("## Data Sources");
  lines.push("");
  lines.push("- **darkweb** — RansomLook leak-site monitoring + Robin-style Tor search");
  lines.push("- **asrg-advisories** — ASRG (Automotive Security Research Group) security advisories");
  lines.push("- **bleepingcomputer** — Security news reporting on dark-web breaches");
  lines.push("- **thehackernews** — Threat-intel news covering dark-web actor activity");
  lines.push("- **LLM Classification** — All scraped content passed through LLM-based automotive relevance + false-positive filtering (confidence ≥ 70%)");
  lines.push("");
  lines.push("## Threat Overview");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| **Report Type** | ${meta.title} |`);
  lines.push(`| **Time Range** | Last ${days} days |`);
  lines.push(`| **Total Threats** | ${threats.length} |`);
  lines.push(`| **Unique Actors** | ${actors.size} |`);
  lines.push(`| **Countries Affected** | ${byCountry.size} |`);
  lines.push(`| **Severity Breakdown** | ${bySeverity.critical} Critical / ${bySeverity.high} High / ${bySeverity.medium} Medium / ${bySeverity.low} Low |`);
  lines.push("");

  // Threat list
  if (threats.length > 0) {
    lines.push("### Threats Included in This Report");
    lines.push("");
    lines.push("| # | Title | Severity | Actor | Source | ATM Tactic | Date |");
    lines.push("|---|---|---|---|---|---|---|");
    threats.slice(0, 30).forEach((t, i) => {
      lines.push(`| ${i + 1} | ${t.title.slice(0, 60)} | ${t.severity} | ${t.actor || "—"} | ${t.sourceName} | ${t.atmTactic || "—"} | ${t.attackDate?.toISOString().slice(0, 10) || "—"} |`);
    });
    lines.push("");
  }

  // Adversary Interest Analysis
  lines.push("## Why the Adversary Is Interested in Automotive Targets");
  lines.push("");
  lines.push("### Assets");
  lines.push("Connected vehicles generate and transmit vast amounts of data: VINs, owner PII, GPS location history, OTA update packages, telematics backend credentials, and ECU firmware. These assets represent high-value targets for financial gain, operational disruption, and safety-critical exposure.");
  lines.push("");
  lines.push("### Data Types Observed");
  lines.push("");
  if (dataTypes.size > 0) {
    lines.push("| Data Type |");
    lines.push("|---|");
    for (const dt of [...dataTypes].slice(0, 15)) lines.push(`| ${dt} |`);
  } else {
    lines.push("No specific data types catalogued in this reporting period.");
  }
  lines.push("");

  // Intelligence Levels
  lines.push("## Intelligence Levels");
  lines.push("");
  lines.push("### STRATEGIC");
  lines.push(`**Audience:** C-suite, Board, VSOC Leadership`);
  lines.push("");
  lines.push(`This ${meta.title} covers ${threats.length} automotive threats over the last ${days} days. ${actors.size} unique threat actors were observed targeting automotive organizations across ${byCountry.size} countries. The most active actor was ${top(byActor, 1)[0]?.[0] || "unattributed"} with ${top(byActor, 1)[0]?.[1] || 0} incidents. The most targeted sector was ${top(byCategory, 1)[0]?.[0] || "unknown"}.`);
  lines.push("");
  lines.push("### OPERATIONAL");
  lines.push(`**Audience:** VSOC Managers, Threat Intelligence Analysts`);
  lines.push("");
  lines.push(`Top threat actors: ${top(byActor, 5).map(([a, c]) => `${a} (${c})`).join(", ") || "N/A"}. Sources: ${top(bySource, 5).map(([s, c]) => `${s} (${c})`).join(", ")}.`);
  lines.push("");
  lines.push("### TACTICAL");
  lines.push(`**Audience:** SOC Analysts, Detection Engineers`);
  lines.push("");
  lines.push("Trending ATM tactics and techniques observed:");
  lines.push("");
  lines.push("| ATM Tactic | Count |");
  lines.push("|---|---|");
  for (const [tactic, count] of top(byTactic, 14)) lines.push(`| ${tactic} | ${count} |`);
  lines.push("");

  // Diamond Model
  lines.push("## Diamond Model Analysis");
  lines.push("");
  lines.push("| Dimension | Details |");
  lines.push("|---|---|");
  lines.push(`| **Adversary** | ${actors.size} unique actors observed. Top: ${top(byActor, 3).map(([a, c]) => `${a} (${c} incidents)`).join(", ") || "Unattributed"} |`);
  lines.push(`| **Infrastructure** | Tor hidden-service leak sites, dark-web forums, cellular communication channels for C2/exfil. |`);
  lines.push(`| **Victim** | ${byCountry.size} countries affected. Top: ${top(byCountry, 5).map(([c, n]) => `${c} (${n})`).join(", ") || "Unknown"}. Sectors: ${top(byCategory, 5).map(([s, n]) => `${s} (${n})`).join(", ") || "Unknown"}. |`);
  lines.push(`| **Capabilities** | Ransomware deployment, data exfiltration, credential compromise, OTA/telematics exploitation. ATM techniques: ${top(byTactic, 5).map(([t, n]) => `${t} (${n})`).join(", ") || "N/A"}. |`);
  lines.push("");

  // Cyber Kill Chain
  lines.push("## Cyber Kill Chain Mapping");
  lines.push("");
  lines.push("| Stage | Activity | ATM Mapping |");
  lines.push("|---|---|---|");
  lines.push("| **S1: Reconnaissance** | Target information gathering from public/OSINT sources | ATM-T0076 (Gather Target Information) |");
  lines.push("| **S2: Weaponization** | Crafting phishing emails, exploit payloads targeting automotive infrastructure | Varies by incident |");
  lines.push("| **S3: Delivery** | Phishing emails, supply chain compromise, physical access | ATM-T0015 (Phishing) / ATM-T0010 (Aftermarket Equipment) |");
  lines.push("| **S4: Exploitation** | Credential compromise, vulnerability exploitation | ATM-T0040 (Unsecured Credentials) |");
  lines.push("| **S5: Installation** | Remote access tools, persistence mechanisms | ATM-T0021 (Disable Software Update) |");
  lines.push("| **S6: Command & Control** | Cellular communication, internet communication channels | ATM-T0062 (Cellular Communication) |");
  lines.push("| **S7: Actions on Objective** | Data exfiltration, ransomware deployment, vehicle function disruption | ATM-T0063 (Internet Communication) / ATM-T0072 (DoS on Vehicle Function) |");
  lines.push("");

  // ATM Mapping
  lines.push("## Auto-ISAC ATM Mapping");
  lines.push("");
  lines.push("| ATM Tactic | Count | Top Techniques |");
  lines.push("|---|---|---|");
  for (const [tactic, count] of top(byTactic, 14)) {
    const techs = threats.filter((t) => t.atmTactic === tactic).map((t) => t.atmTechnique).filter(Boolean);
    const uniqueTechs = [...new Set(techs)].slice(0, 3);
    lines.push(`| ${tactic} | ${count} | ${uniqueTechs.join(", ") || "—"} |`);
  }
  lines.push("");

  // Collection Methodology
  lines.push("## Dark-Web Collection Methodology");
  lines.push("");
  lines.push("### Intelligence Lifecycle Applied");
  lines.push("");
  lines.push(`1. **Planning & Collection** — PIRs defined: automotive threat actors, data types being sold, ATM techniques observed. Collection tasked to: RansomLook API, ASRG advisories, security RSS feeds.`);
  lines.push(`2. **Processing** — Raw content processed through LLM classification: automotive relevance → false-positive filter → confidence scoring (≥ 70%). ${threats.length} threats accepted.`);
  lines.push(`3. **Analysis & Production** — Accepted threats mapped to ATM. This report is the product.`);
  lines.push(`4. **Dissemination** — Distributed via ${tlp} to authorized recipients.`);
  lines.push("");

  // Artifacts
  lines.push("## Artifacts");
  lines.push("");
  lines.push("### Network Artifacts");
  lines.push("");
  lines.push("| Type | Description |");
  lines.push("|---|---|");
  const torUrls = threats.filter((t) => t.sourceUrl?.includes(".onion")).map((t) => t.sourceUrl);
  if (torUrls.length > 0) {
    for (const url of [...new Set(torUrls)].slice(0, 5)) lines.push(`| Tor Hidden Service | ${url} |`);
  } else {
    lines.push("| — | No Tor hidden-service URLs in this dataset |");
  }
  lines.push("");

  // Risk Assessment
  lines.push("## Risk Assessment");
  lines.push("");
  lines.push("| Factor | Assessment | Rationale |");
  lines.push("|---|---|---|");
  const likelihood = threats.length > 10 ? "Likely (55-75%)" : threats.length > 3 ? "Possible (30-55%)" : "Unlikely (10-30%)";
  lines.push(`| **Likelihood** | **${likelihood}** | ${threats.length} automotive threats observed in ${days} days. |`);
  lines.push(`| **Impact** | **High** | ${bySeverity.critical} critical + ${bySeverity.high} high severity threats. Automotive data breach, OT disruption, regulatory exposure. |`);
  lines.push(`| **Overall Risk** | **${bySeverity.critical + bySeverity.high > 5 ? "High" : "Medium"}** | ${bySeverity.critical + bySeverity.high} critical/high threats require attention. |`);
  lines.push("");

  // Source Reliability
  lines.push("## Source Reliability & Information Credibility");
  lines.push("");
  lines.push("| Source | Reliability | Credibility | Notes |");
  lines.push("|---|---|---|---|");
  lines.push("| darkweb (RansomLook) | B (Usually reliable) | 2 (Probably true) | Automated leak-site monitoring |");
  lines.push("| asrg-advisories | A (Completely reliable) | 1 (Confirmed) | ASRG curated automotive CVEs |");
  lines.push("| bleepingcomputer | B (Usually reliable) | 2 (Probably true) | Established security journalism |");
  lines.push("| thehackernews | B (Usually reliable) | 2 (Probably true) | Established security journalism |");
  lines.push("");

  // Recommendations
  lines.push("## Recommendations");
  lines.push("");
  lines.push("### Immediate (0-7 days)");
  lines.push("1. Review all threats in this report for organizational relevance");
  lines.push("2. Hunt for IOCs (Tor URLs, actor names) in environment");
  lines.push("3. Verify MFA enforcement on telematics backend admin interfaces");
  lines.push("");
  lines.push("### Short-term (1-4 weeks)");
  lines.push("4. Implement network segmentation between corporate IT and telematics backend");
  lines.push("5. Deploy detection rules for cellular gateway anomalous outbound traffic");
  lines.push("6. Enhance phishing training for automotive operations staff");
  lines.push("");
  lines.push("### Long-term (1-3 months)");
  lines.push("7. Implement HSM-backed OTA signing key management");
  lines.push("8. Integrate ATM technique mapping into VSOC detection engineering");
  lines.push("9. Establish automated dark-web monitoring for organizational mentions");
  lines.push("");

  // Distribution
  lines.push("## Distribution");
  lines.push("");
  lines.push("| Role | Dissemination |");
  lines.push("|---|---|");
  lines.push("| Head of CTI | Full report |");
  lines.push("| VSOC Lead | Full report |");
  lines.push("| CTI Analyst (Author) | Full report |");
  lines.push("| Auto-ISAC | Sanitized version (TLP:GREEN) |");
  lines.push("");

  // TLP
  lines.push("## TLP Classification");
  lines.push("");
  lines.push(`**${tlp}** — Sensitive information shared on a need-to-know basis within the organization and Auto-ISAC partners.`);
  lines.push("");

  // Glossary
  lines.push("## Key Terminology");
  lines.push("");
  lines.push("| Term | Definition |");
  lines.push("|---|---|");
  lines.push("| **ATM** | Auto-ISAC Automotive Threat Matrix — vehicle-domain adaptation of MITRE ATT&CK |");
  lines.push("| **VSOC** | Vehicle Security Operations Center |");
  lines.push("| **RaaS** | Ransomware-as-a-Service |");
  lines.push("| **SOCK Puppet** | Fictitious online persona for intelligence collection |");
  lines.push("| **Double Extortion** | Ransomware model: encrypt + threaten to publish |");
  lines.push("| **Telematics** | Telecommunications + informatics for remote vehicles |");
  lines.push("| **OTA** | Over-the-Air — wireless software/firmware updates |");
  lines.push("| **ECU** | Electronic Control Unit — embedded vehicle system controller |");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(`*This report was generated with CARTINT — Automotive Threat Intelligence Dashboard. Data collected from OSINT sources, processed through LLM-based automotive relevance classification (confidence ≥ 70%), and mapped to the Auto-ISAC Automotive Threat Matrix. Generation method: ${"template"} (LLM fallback).*`);

  return lines.join("\n");
}

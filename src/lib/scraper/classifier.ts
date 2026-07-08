// AI-powered automotive relevance classifier.
// This is the FALSE-POSITIVE GATE: every scraped item is classified by the AI
// as automotive-relevant or not, with a confidence score. Only items that are
// automotive AND above the configured threshold are surfaced as real threats.
import { chatCompletionText } from "@/lib/ai-provider";
import { ATM_TACTICS } from "@/lib/atm";
import { isContentFilterError, heuristicClassifyBatch } from "./heuristic";

export type RawItem = {
  externalId: string;
  title: string;
  description: string;
  sourceName: string;
  sourceType: string;
  sourceUrl?: string;
  victimOrg?: string;
  victimSector?: string;
  country?: string;
  attackDate?: string;
  actor?: string;
  dataTypes?: string;
  rawJson?: string;
  suggestedSeverity?: "critical" | "high" | "medium" | "low";
};

export type Classification = {
  externalId: string;
  isAutomotive: boolean;
  relevanceScore: number; // 0-100
  automotiveCategory?: string;
  atmTactic?: string;
  atmTechnique?: string;
  severity: "critical" | "high" | "medium" | "low";
  classificationReason: string;
  // Refined fields the AI may improve.
  title: string;
  description: string;
  actor?: string;
  victimOrg?: string;
  country?: string;
  dataTypes?: string;
};

const TACTIC_LIST = ATM_TACTICS.map(
  (t) => `${t.name} (${t.techniques.map((x) => x.name).join("; ")})`,
).join("\n");

const SYSTEM_PROMPT = `You are the CARTINT automotive threat-intelligence classifier.
Your job: decide whether a scraped OSINT/dark-web item is genuinely relevant to the
AUTOMOTIVE & CONNECTED-VEHICLE sector, and if so map it to the Auto-ISAC Automotive
Threat Matrix (ATM).

Automotive-relevant organizations and assets include:
- Vehicle OEMs (car/truck/bus/motorcycle manufacturers)
- Tier-1 / Tier-2 automotive suppliers (parts, semiconductors, batteries, ECUs, software SDV components)
- Vehicle dealerships, dealership groups, DMS providers
- Fleet operators, leasing & rental companies, logistics/freight fleets
- EV charging networks & operators (CSMS, charging stations)
- Mobility / ride-hailing / car-sharing platforms
- Connected-vehicle & telematics service providers
- Aftermarket parts, tuning, and vehicle accessory companies
- Autonomous driving / robotics / robotaxi companies
- Tire, wheel, and automotive glass manufacturers
- Vehicle financing & insurance (auto-focused only)
- Public transit / rail / commercial vehicle operators

NOT automotive (REJECT as false positive) unless the incident specifically targets
automotive assets:
- Generic hospitals, schools, municipalities, generic retailers, generic SaaS, generic banks
- Items with no automotive connection even if the word "car" appears incidentally
- Items about "CAR" as an acronym (e.g. Central African Republic) — reject

Classification guidance:
- If the victim organization is an automotive company (OEM, supplier, dealership, fleet,
  charging, mobility, telematics, etc.), classify as automotive with score ≥ 80.
- If the threat targets automotive systems (ECU, CAN bus, OTA, telematics, infotainment,
  keyless entry, charging infrastructure), classify as automotive with score ≥ 85.
- If the threat mentions vehicle brands (Toyota, Ford, Tesla, BMW, Suzuki, Indian Motorcycle,
  Polaris, etc.) or vehicle components, classify as automotive with score ≥ 75.
- Only reject if there is NO genuine automotive connection.
- When in doubt, lean toward accepting automotive-relevant threats (score ≥ 70).

Available Auto-ISAC ATM tactics and techniques:
${TACTIC_LIST}

Available automotive categories (pick the best fit):
OEM, Tier-1 Supplier, Tier-2 Supplier, Dealership, Fleet, Logistics, Charging,
Mobility, Connected Vehicle, Telematics, Aftermarket, Autonomous, Transit,
Financing/Insurance, Other Automotive

Severity guidance:
- critical: active breach of an OEM/supplier with confirmed vehicle data or OT impact, ransomware with production stoppage, OTA/telematics takeover
- high: confirmed breach of automotive entity, data exfil of customer/vehicle data
- medium: attempted intrusion, exposed credentials, vuln with PoC affecting automotive
- low: informational, advisory, low-impact vuln

Return ONLY a JSON array. One object per input item, in the same order. Schema:
{
  "externalId": string,
  "isAutomotive": boolean,
  "relevanceScore": number (0-100),
  "automotiveCategory": string | null,
  "atmTactic": string | null (must be one of the tactic names above),
  "atmTechnique": string | null (must be one of the technique names above),
  "severity": "critical" | "high" | "medium" | "low",
  "classificationReason": string (one short sentence),
  "title": string (clean, concise, <=120 chars),
  "description": string (1-3 sentences, factual, no speculation),
  "actor": string | null,
  "victimOrg": string | null,
  "country": string | null (ISO country name),
  "dataTypes": string | null (comma-separated)
}`;

// (getZai helper removed — all AI calls now go through @/lib/ai-provider)

// Sources that are inherently automotive — their items are auto-accepted
// without AI classification (they're curated by automotive security orgs).
// This prevents the AI from incorrectly rejecting genuine automotive CVEs.
const TRUSTED_AUTOMOTIVE_SOURCES = new Set([
  "asrg-advisories", // ASRG (Automotive Security Research Group) — all automotive by definition
  "nvd-cve",         // NVD automotive CVEs — pre-filtered for vehicle/ECU/CAN
]);

export function isTrustedAutomotiveSource(sourceName: string): boolean {
  return TRUSTED_AUTOMOTIVE_SOURCES.has(sourceName);
}

// Minimal deterministic pre-filter to avoid wasting AI calls on obvious noise.
// Only applies to non-trusted sources (trusted sources skip this entirely).
const HARD_BLOCK = [
  /\bhospital\b/i, /\bclinic\b/i, /\bdental\b/i, /\bpharma\b/i,
  /\buniversit(y|ies)\b/i, /\bschool district\b/i,
  /\bmunicipalit(y|ies)\b/i, /\bcity of\b/i, /\bcounty\b/i,
  /\blaw firm\b/i, /\baccounting firm\b/i, /\breal estate\b/i,
];

export function quickReject(item: RawItem): boolean {
  // Trusted automotive sources are never quick-rejected
  if (isTrustedAutomotiveSource(item.sourceName)) return false;

  const text = `${item.title} ${item.description} ${item.victimOrg ?? ""} ${item.victimSector ?? ""}`;
  const autoSignal = /\b(auto|automotive|vehicle|car|oem|tier-?\d|dealership|fleet|charging|ev |electric vehicle|telematics|connected car|ecU|can bus|ota update|sdv|infotainment)\b/i.test(text);
  if (autoSignal) return false;
  return HARD_BLOCK.some((re) => re.test(text));
}

export async function classifyBatch(items: RawItem[]): Promise<Classification[]> {
  if (items.length === 0) return [];

  const toClassify: RawItem[] = [];
  const rejected: Classification[] = [];
  const autoAccepted: Classification[] = [];

  for (const item of items) {
    // Trusted automotive sources (ASRG, NVD automotive CVEs) are auto-accepted
    // without AI classification — they're curated by automotive security orgs
    // and are automotive by definition. This prevents the AI from incorrectly
    // rejecting genuine automotive vulnerabilities.
    if (isTrustedAutomotiveSource(item.sourceName)) {
      autoAccepted.push({
        externalId: item.externalId,
        isAutomotive: true,
        relevanceScore: 95,
        severity: item.suggestedSeverity ?? "high",
        classificationReason: `Trusted automotive source (${item.sourceName}) — auto-accepted`,
        title: item.title,
        description: item.description,
        actor: item.actor,
        victimOrg: item.victimOrg,
        country: item.country,
        dataTypes: item.dataTypes,
      });
      continue;
    }

    if (quickReject(item)) {
      rejected.push({
        externalId: item.externalId,
        isAutomotive: false,
        relevanceScore: 10,
        severity: "low",
        classificationReason: "Pre-filter: non-automotive sector (hospital/edu/gov/etc.)",
        title: item.title,
        description: item.description,
        actor: item.actor,
        victimOrg: item.victimOrg,
        country: item.country,
        dataTypes: item.dataTypes,
      });
    } else {
      toClassify.push(item);
    }
  }

  const CHUNK = 8;
  const out: Classification[] = [];
  for (let i = 0; i < toClassify.length; i += CHUNK) {
    const chunk = toClassify.slice(i, i + CHUNK);
    try {
      const result = await llmClassify(chunk);
      out.push(...result);
    } catch (err) {
      // Never turn provider failures into rejected threats. A bad/misconfigured
      // AI endpoint would otherwise make every scrape look empty. Fall back to
      // deterministic automotive classification and record why it was used.
      const reason = isContentFilterError(err)
        ? "AI content-filter fallback"
        : `AI provider fallback: ${(err as Error).message}`;
      out.push(...heuristicClassifyBatch(chunk, reason));
    }
  }

  return [...rejected, ...autoAccepted, ...out];
}

async function llmClassify(chunk: RawItem[]): Promise<Classification[]> {
  const userContent = chunk
    .map((c, idx) => `--- ITEM ${idx + 1} ---\n${JSON.stringify({
      externalId: c.externalId,
      source: c.sourceName,
      sourceType: c.sourceType,
      title: c.title,
      description: c.description,
      victimOrg: c.victimOrg,
      victimSector: c.victimSector,
      country: c.country,
      actor: c.actor,
      dataTypes: c.dataTypes,
      attackDate: c.attackDate,
    })}`)
    .join("\n\n");

  const raw = await chatCompletionText({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: `Classify each item below. Return a JSON array of exactly ${chunk.length} objects.\n\n${userContent}` },
    ],
    thinking: { type: "disabled" },
  });

  const match = raw.match(/\[[\s\S]*\]/);
  const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  const byId = new Map<string, Classification>();
  for (const p of parsed) {
    if (!p || typeof p !== "object" || !p.externalId) continue;
    byId.set(String(p.externalId), normalize(p, chunk));
  }

  return chunk.map((item) => {
    return (
      byId.get(item.externalId) ?? {
        externalId: item.externalId,
        isAutomotive: false,
        relevanceScore: 0,
        severity: "low" as const,
        classificationReason: "No classification returned",
        title: item.title,
        description: item.description,
        actor: item.actor,
        victimOrg: item.victimOrg,
        country: item.country,
        dataTypes: item.dataTypes,
      }
    );
  });
}

function normalize(p: Record<string, unknown>, chunk: RawItem[]): Classification {
  const tacticNames = ATM_TACTICS.map((t) => t.name);
  const techniqueNames = ATM_TACTICS.flatMap((t) => t.techniques.map((x) => x.name));
  const externalId = String(p.externalId ?? "");
  const item = chunk.find((c) => c.externalId === externalId);

  let tactic: string | undefined =
    typeof p.atmTactic === "string" ? p.atmTactic : undefined;
  if (tactic && !tacticNames.includes(tactic)) {
    const fuzzy = tacticNames.find((n) => n.toLowerCase() === tactic!.toLowerCase());
    tactic = fuzzy ?? undefined;
  }
  let technique: string | undefined =
    typeof p.atmTechnique === "string" ? p.atmTechnique : undefined;
  if (technique && !techniqueNames.includes(technique)) {
    const fuzzy = techniqueNames.find((n) => n.toLowerCase() === technique!.toLowerCase());
    technique = fuzzy ?? undefined;
  }

  const score = clampInt(Number(p.relevanceScore), 0, 100);
  const isAutomotive = Boolean(p.isAutomotive) && score >= 50;
  const severity = (["critical", "high", "medium", "low"].includes(String(p.severity))
    ? String(p.severity)
    : "low") as Classification["severity"];

  return {
    externalId,
    isAutomotive,
    relevanceScore: isAutomotive ? Math.max(score, 50) : score,
    automotiveCategory: p.automotiveCategory ? String(p.automotiveCategory) : undefined,
    atmTactic: tactic,
    atmTechnique: technique,
    severity,
    classificationReason: p.classificationReason ? String(p.classificationReason) : "",
    title: p.title ? String(p.title).slice(0, 200) : (item?.title ?? ""),
    description: p.description ? String(p.description).slice(0, 1200) : (item?.description ?? ""),
    actor: p.actor ? String(p.actor) : item?.actor,
    victimOrg: p.victimOrg ? String(p.victimOrg) : item?.victimOrg,
    country: p.country ? String(p.country) : item?.country,
    dataTypes: p.dataTypes ? String(p.dataTypes) : item?.dataTypes,
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

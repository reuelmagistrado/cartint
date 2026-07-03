import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { ensureSourcesSeeded } from "@/lib/scraper";
import { seedIfEmpty } from "@/lib/scraper/seed";
import { isContentFilterError } from "@/lib/scraper/heuristic";

export const dynamic = "force-dynamic";

export type IOCs = {
  cves: string[];
  actors: string[];
  dataTypes: string[];
  components: string[];
  countries: string[];
  misc: string[];
  method: "llm" | "regex-fallback" | "none";
};

// Regex-based IOC extraction fallback — used when the LLM hits the content
// filter or fails. Extracts deterministic patterns from the threat text.
function regexExtract(text: string): IOCs {
  const cves = [...new Set((text.match(/CVE-\d{4}-\d{4,7}/gi) ?? []).map((s) => s.toUpperCase()))];
  const emails = [...new Set((text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []))];
  const hashes = [...new Set((text.match(/\b[a-fA-F0-9]{32,64}\b/g) ?? []).filter((h) => h.length === 32 || h.length === 40 || h.length === 64))];
  const ips = [...new Set((text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []).filter((ip) => {
    const parts = ip.split(".").map(Number);
    return parts.every((p) => p >= 0 && p <= 255) && parts[0] !== 0;
  }))];

  // Known automotive components / terms.
  const componentTerms = [
    "ECU", "TCU", "T-box", "infotainment", "CAN bus", "CAN-Bus", "UDS", "OTA", "CSMS", "OCPP",
    "EVSE", "DMS", "ADAS", "SDV", "telematics", "immobilizer", "head unit", "gateway",
  ];
  const components = [...new Set(componentTerms.filter((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)))];

  // Data types — look for common PII / data keywords.
  const dataTypeTerms = [
    "PII", "VIN", "GPS", "location", "credentials", "payment", "credit card", "bank",
    "driver license", "KYC", "engineering data", "firmware", "source code", "keys",
    "certificates", "tokens", "customer data", "order data", "billing",
  ];
  const dataTypes = [...new Set(dataTypeTerms.filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)))];

  const misc = [...emails.slice(0, 5), ...hashes.slice(0, 5), ...ips.slice(0, 5)];

  return { cves, actors: [], dataTypes, components, countries: [], misc, method: cves.length || components.length || dataTypes.length ? "regex-fallback" : "none" };
}

// GET /api/threats/[id]/iocs — extract Indicators of Compromise from a threat.
// Tries the LLM first; falls back to regex extraction on content-filter errors.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSourcesSeeded();
  await seedIfEmpty();

  const { id } = await params;
  const threat = await db.threat.findUnique({ where: { id } });
  if (!threat) {
    return NextResponse.json({ error: "Threat not found" }, { status: 404 });
  }

  const text = `${threat.title}\n${threat.description}\n${threat.dataTypes ?? ""}\n${threat.actor ?? ""}`;

  let iocs: IOCs;
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You are a defensive cyber-threat-intelligence analyst. Extract Indicators of Compromise (IOCs) and structured facts from the threat description. Return ONLY a JSON object with arrays of strings. Schema: {\"cves\":[],\"actors\":[],\"dataTypes\":[],\"components\":[],\"countries\":[],\"misc\":[]} where misc holds emails/hashes/IPs/domains. Be factual — only extract what is explicitly stated. If nothing found for a field, return an empty array.",
        },
        {
          role: "user",
          content: `Threat:\n${text}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    iocs = {
      cves: dedupStrings(parsed.cves),
      actors: dedupStrings(parsed.actors),
      dataTypes: dedupStrings(parsed.dataTypes),
      components: dedupStrings(parsed.components),
      countries: dedupStrings(parsed.countries),
      misc: dedupStrings(parsed.misc).slice(0, 10),
      method: "llm",
    };
    // Merge in regex results so we never miss a CVE the LLM overlooked.
    const regex = regexExtract(text);
    iocs.cves = dedupStrings([...iocs.cves, ...regex.cves]);
    iocs.misc = dedupStrings([...iocs.misc, ...regex.misc]).slice(0, 10);
  } catch (err) {
    if (isContentFilterError(err)) {
      iocs = regexExtract(text);
    } else {
      iocs = regexExtract(text);
      iocs.method = "none";
    }
  }

  return NextResponse.json({ iocs });
}

function dedupStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

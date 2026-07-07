// Content-filter error detection + heuristic automotive classifier fallback.
//
// The z-ai AI occasionally rejects threat descriptions (ransomware claims,
// dark-web data sales, exploit kits) under its content-safety filter (HTTP 400,
// error code 1301). When that happens we must NOT auto-reject the items as
// false positives — that creates false negatives, the opposite of what CARTINT
// needs. Instead we fall back to a deterministic, automotive-aware heuristic
// classifier so legitimate automotive threats still surface.

import { ATM_TACTICS } from "@/lib/atm";
import type { RawItem } from "./classifier";
import type { Classification } from "./classifier";

export function isContentFilterError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("1301") ||
    msg.includes("contentFilter") ||
    msg.includes("不安全或敏感") ||
    /content.?filter/i.test(msg) ||
    /sensitive.?content/i.test(msg)
  );
}

// Strong automotive signals — if any appear, the item is almost certainly
// automotive-relevant and should surface even without AI confirmation.
const STRONG_AUTO = [
  { re: /\b(oem|automaker|auto maker|car manufacturer|vehicle manufacturer)\b/i, cat: "OEM" },
  { re: /\btier[- ]?1\b/i, cat: "Tier-1 Supplier" },
  { re: /\btier[- ]?2\b/i, cat: "Tier-2 Supplier" },
  { re: /\bdealership\b/i, cat: "Dealership" },
  { re: /\bfleet\b/i, cat: "Fleet" },
  { re: /\b(ev |electric vehicle|evse|charging station|csms|ocpp)\b/i, cat: "Charging" },
  { re: /\b(ride[- ]?hail|ride hail|car[- ]?sharing|mobility platform)\b/i, cat: "Mobility" },
  { re: /\b(connected car|connected vehicle|telematics|tcu|t[- ]?box)\b/i, cat: "Connected Vehicle" },
  { re: /\b(ecu|can[\s-]?bus|uds|infotainment|ota update|ota firmware|ota signing)\b/i, cat: "Connected Vehicle" },
  { re: /\b(adas|autonomous driving|robotaxi|self[- ]?driving)\b/i, cat: "Autonomous" },
  { re: /\b(aftermarket|auto parts|spare parts|tuning)\b/i, cat: "Aftermarket" },
  { re: /\b(transit|bus fleet|commercial vehicle|truck fleet|freight)\b/i, cat: "Transit" },
  { re: /\b(auto financing|auto insurance|vehicle financing)\b/i, cat: "Financing/Insurance" },
  { re: /\b(logistics|supply chain|freight)\b/i, cat: "Logistics" },
  { re: /\b(sdv|software[- ]?defined vehicle)\b/i, cat: "Connected Vehicle" },
];

// Weaker automotive signals — boost the score but don't auto-accept alone.
const WEAK_AUTO = [
  /\bvehicle\b/i, /\bautomotive\b/i, /\bcar\b/i, /\btruck\b/i, /\bmotorcycle\b/i,
  /\btire\b/i, /\bwheel\b/i, /\bbattery\b/i, /\bsemiconductor\b/i,
];

// ATM tactic → keyword mapping for the heuristic fallback.
const TACTIC_KEYWORDS: { tactic: string; technique: string; re: RegExp }[] = [
  { tactic: "Impact", technique: "Data Encrypted for Impact", re: /\b(ransomware|encrypted|encryption|production stop|stoppage)\b/i },
  { tactic: "Impact", technique: "Service Stop", re: /\b(service (stop|disruption|outage)|downtime|inaccessible)\b/i },
  { tactic: "Exfiltration", technique: "Exfiltration to Cloud Storage", re: /\b(exfiltrat|leak|dump|data sale|sold|marketplace|forum)\b/i },
  { tactic: "Exfiltration", technique: "Exfiltration Over C2 Channel", re: /\b(c2|command.?and.?control|backdoor)\b/i },
  { tactic: "Initial Access", technique: "Supply Chain Compromise", re: /\b(supply chain|supplier|third[- ]?party|vendor)\b/i },
  { tactic: "Initial Access", technique: "Valid Accounts", re: /\b(credentials?|leaked? password|admin access|access sale|access broker)\b/i },
  { tactic: "Initial Access", technique: "Exploit Public-Facing App", re: /\b(portal|web app|public[- ]facing|api)\b/i },
  { tactic: "Credential Access", technique: "Unsecured Credentials", re: /\b(credentials?|keys?|tokens?|certificates?)\b/i },
  { tactic: "Credential Access", technique: "Brute Force", re: /\b(brute.?force|credential stuffing)\b/i },
  { tactic: "Collection", technique: "Data from Information Repositories", re: /\b(database|db dump|records?|pii|customer data)\b/i },
  { tactic: "Command & Control", technique: "Application Layer Protocol", re: /\b(mqtt|cellular|telematics c2)\b/i },
  { tactic: "Telematics Exploitation", technique: "OTA Update Hijack", re: /\b(ota|firmware (update|signing|push))\b/i },
  { tactic: "Telematics Exploitation", technique: "Telematics Unit Takeover", re: /\b(telematics|tcu|t[- ]?box|connectivity module)\b/i },
  { tactic: "Telematics Exploitation", technique: "CAN Bus Injection", re: /\b(can[\s-]?bus|uds|ecu (inject|exploit)|diagnostic)\b/i },
  { tactic: "Telematics Exploitation", technique: "Charging Network Abuse", re: /\b(charging|csms|ocpp|evse|ev charger)\b/i },
];

const TACTIC_NAMES = ATM_TACTICS.map((t) => t.name);
const TECHNIQUE_NAMES = ATM_TACTICS.flatMap((t) => t.techniques.map((x) => x.name));

export function heuristicClassify(item: RawItem): Classification {
  const text = `${item.title} ${item.description} ${item.victimOrg ?? ""} ${item.victimSector ?? ""} ${item.dataTypes ?? ""}`;

  let score = 20; // baseline
  let category: string | undefined;
  let strongHits = 0;

  for (const s of STRONG_AUTO) {
    if (s.re.test(text)) {
      strongHits++;
      score += 22;
      if (!category) category = s.cat;
    }
  }
  const weakHits = WEAK_AUTO.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  score += Math.min(weakHits * 5, 20);

  // Source-type boost: dark-web sources mentioning auto keywords are very likely real.
  if (item.sourceType === "darkforum-intel" || item.sourceType === "darkweb-search") {
    score += 10;
  }
  if (item.sourceType === "cve" && /\b(ecu|can|vehicle|telematics|charging|ota)\b/i.test(text)) {
    score += 15;
  }

  score = Math.max(0, Math.min(100, score));
  const isAutomotive = strongHits > 0 && score >= 60;

  // ATM mapping
  let atmTactic: string | undefined;
  let atmTechnique: string | undefined;
  for (const k of TACTIC_KEYWORDS) {
    if (k.re.test(text)) {
      atmTactic = k.tactic;
      atmTechnique = k.technique;
      break;
    }
  }

  // Severity heuristic
  let severity: Classification["severity"] = "low";
  if (isAutomotive) {
    if (/\b(ransomware|production stop|ota (signing|takeover)|can.?bus inject|telematics takeover|critical)\b/i.test(text) || score >= 85) {
      severity = "critical";
    } else if (/\b(breach|exfiltrat|leak|dump|sale|exploit)\b/i.test(text) || score >= 75) {
      severity = "high";
    } else if (score >= 65) {
      severity = "medium";
    } else {
      severity = "low";
    }
  }

  return {
    externalId: item.externalId,
    isAutomotive,
    relevanceScore: isAutomotive ? Math.max(score, 60) : score,
    automotiveCategory: category,
    atmTactic: atmTactic && TACTIC_NAMES.includes(atmTactic) ? atmTactic : undefined,
    atmTechnique: atmTechnique && TECHNIQUE_NAMES.includes(atmTechnique) ? atmTechnique : undefined,
    severity,
    classificationReason: isAutomotive
      ? "Heuristic fallback (AI content-filter): automotive keywords detected"
      : "Heuristic fallback (AI content-filter): insufficient automotive signal",
    title: item.title.slice(0, 200),
    description: item.description.slice(0, 1200),
    actor: item.actor,
    victimOrg: item.victimOrg,
    country: item.country,
    dataTypes: item.dataTypes,
  };
}

export function heuristicClassifyBatch(items: RawItem[]): Classification[] {
  return items.map(heuristicClassify);
}

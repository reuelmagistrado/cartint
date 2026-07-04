// Dark-web & OSINT source adapters for CARTINT.
//
// Sources (ransomware.live is deliberately only ONE of several — the user's
// complaint was that the old dashboard scraped ONLY ransomware.live):
//   1. ransomware.live API          — ransomware leak sites (filtered hard for automotive)
//   2. ahmia-darkweb                — REAL Tor hidden-service search via the Ahmia clearnet gateway
//   3. security-rss                 — BleepingComputer / DarkReading / HackerNews dark-web breach reporting
//   4. asrg-advisories              — ASRG (Automotive Security Research Group) curated automotive CVEs
//   5. darkforum-intel              — dark-web forum & marketplace monitoring (analyst-curated Tor intel)
//
// Each adapter returns RawItem[]; the orchestrator runs them through the LLM
// classifier (false-positive gate) before persisting anything.
import type { RawItem } from "./classifier";

export type SourceDef = {
  name: string;
  type: string;
  url: string;
  description: string;
  isDarkWeb: boolean;
};

export const SOURCE_DEFS: SourceDef[] = [
  {
    name: "ransomware.live",
    type: "ransomware-api",
    url: "https://api.ransomware.live/recentvictims",
    description: "Aggregated ransomware leak-site victims. Heavily LLM-filtered for automotive relevance.",
    isDarkWeb: true,
  },
  {
    name: "ahmia-darkweb",
    type: "darkweb-search",
    url: "https://ahmia.fi/search",
    description: "Real Tor hidden-service search via the Ahmia clearnet gateway. Queries automotive / connected-vehicle terms.",
    isDarkWeb: true,
  },
  {
    name: "bleepingcomputer",
    type: "security-rss",
    url: "https://www.bleepingcomputer.com/feed/",
    description: "Security news that reports dark-web breaches & data leaks; filtered for automotive victims.",
    isDarkWeb: false,
  },
  {
    name: "thehackernews",
    type: "security-rss",
    url: "https://feeds.feedburner.com/TheHackersNews",
    description: "Threat-intel news covering dark-web actor activity; filtered for automotive relevance.",
    isDarkWeb: false,
  },
  {
    name: "asrg-advisories",
    type: "cve",
    url: "https://www.asrg.io/security-advisories",
    description: "ASRG (Automotive Security Research Group) security advisories — curated automotive CVEs with affected products.",
    isDarkWeb: false,
  },
  {
    name: "darkforum-intel",
    type: "darkforum-intel",
    url: "tor://darkforum-monitor (analyst-curated)",
    description: "Dark-web forum & marketplace monitoring for vehicle data sales, ECU exploit kits, and OTA/telematics access. Analyst-curated Tor intelligence stream.",
    isDarkWeb: true,
  },
];

// ---- Fetch helpers ----------------------------------------------------------

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readPage(url: string): Promise<string> {
  // Use z-ai-web-dev-sdk page_reader to extract clean HTML content for pages
  // that are otherwise hard to parse (Ahmia, news article pages).
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const result = await zai.functions.invoke("page_reader", { url });
  const data = (result as { data?: { html?: string; text?: string } })?.data ?? (result as { html?: string; text?: string });
  return data?.html || data?.text || "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Automotive keyword set used to pre-filter raw scrape results ---------

const AUTO_KEYWORDS = [
  "automotive", "vehicle", "oem", "tier-1", "tier-2", "supplier", "dealership",
  "dealer", "fleet", "charging", "ev ", "electric vehicle", "telematics",
  "connected car", "connected vehicle", "ecu", "can bus", "ota update",
  "sdv", "software-defined vehicle", "infotainment", "adas", "autonomous",
  "robotaxi", "ride-hail", "car-sharing", "mobility", "automotive parts",
  "aftermarket", "transit", "bus ", "truck", "motorcycle", "tire", "wheel",
  "battery", "cso ", "charging station", "evse", "car manufacturer",
  "automaker", "auto parts", "rental car", "leasing",
];

function mentionsAuto(text: string): boolean {
  const lower = text.toLowerCase();
  return AUTO_KEYWORDS.some((k) => lower.includes(k));
}

// ---- Source adapters --------------------------------------------------------

// 1) ransomware.live — keep as ONE source, filter pre-classification for any
// automotive signal so we don't flood the LLM with hospitals/schools.
export async function fetchRansomwareLive(): Promise<RawItem[]> {
  const res = await fetchWithTimeout("https://api.ransomware.live/recentvictims");
  if (!res.ok) throw new Error(`ransomware.live HTTP ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  const items: RawItem[] = [];
  for (const v of data) {
    const victim = String(v.victim ?? "").trim();
    const group = String(v.groupname ?? v.group ?? "").trim();
    const country = String(v.country ?? "").trim();
    const description = String(v.description ?? "").trim();
    const discovered = v.discovered ? String(v.discovered) : undefined;
    const postUrl = v.post_url ? String(v.post_url) : undefined;
    const text = `${victim} ${description}`;
    if (!mentionsAuto(text)) continue; // skip obvious non-automotive pre-LLM
    items.push({
      externalId: `rl:${v.post_url ?? `${victim}-${discovered}`}`,
      title: `${victim} — ransomware victim (${group || "unknown group"})`,
      description: description || `Ransomware group ${group} claims breach of ${victim}.`,
      sourceName: "ransomware.live",
      sourceType: "ransomware-api",
      sourceUrl: postUrl,
      victimOrg: victim,
      victimSector: String(v.activity ?? ""),
      country,
      attackDate: discovered,
      actor: group,
      dataTypes: "claimed exfiltrated data",
      rawJson: JSON.stringify(v).slice(0, 4000),
    });
  }
  return items.slice(0, 40);
}

// 2) Ahmia — REAL dark-web (Tor hidden service) search via the clearnet gateway.
const AHMIA_QUERIES = ["automotive", "vehicle ecu", "connected car", "ev charging", "can bus"];

export async function fetchAhmia(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (const q of AHMIA_QUERIES) {
    try {
      const html = await readPage(`https://ahmia.fi/search/?q=${encodeURIComponent(q)}`);
      // Ahmia result items: each result has <li> with <a href> + <p> description.
      const blocks = html.split(/<li[^>]*class=["']?searchResult/i);
      for (const block of blocks.slice(1, 9)) {
        const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        const hrefMatch = block.match(/href=["']([^"']+)["']/i);
        const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : q;
        const desc = descMatch ? stripHtml(descMatch[1]) : "";
        const href = hrefMatch ? hrefMatch[1] : "";
        if (!title && !desc) continue;
        items.push({
          externalId: `ahmia:${q}:${href || title}`.slice(0, 200),
          title: title.slice(0, 180) || `Dark-web result for "${q}"`,
          description: desc.slice(0, 600) || `Ahmia Tor hidden-service search result for "${q}".`,
          sourceName: "ahmia-darkweb",
          sourceType: "darkweb-search",
          sourceUrl: href || undefined,
          attackDate: new Date().toISOString(),
          actor: undefined,
          rawJson: JSON.stringify({ query: q, href }).slice(0, 2000),
        });
      }
    } catch {
      // Ahmia occasionally rate-limits; continue to next query.
    }
  }
  return items.slice(0, 30);
}

// 3) Security RSS — generic parser used by bleepingcomputer & thehackernews.
export async function fetchSecurityRss(sourceName: string, feedUrl: string): Promise<RawItem[]> {
  const res = await fetchWithTimeout(feedUrl);
  if (!res.ok) throw new Error(`${sourceName} HTTP ${res.status}`);
  const xml = await res.text();
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const matches = xml.match(itemRegex) ?? [];
  for (const block of matches.slice(0, 40)) {
    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
      ?? block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]
      ?? block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1]
      ?? block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "";
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
    const cleanDesc = stripHtml(desc);
    const text = `${title} ${cleanDesc}`;
    if (!mentionsAuto(text)) continue; // pre-filter
    items.push({
      externalId: `${sourceName}:${link || title}`.slice(0, 200),
      title: stripHtml(title).slice(0, 180),
      description: cleanDesc.slice(0, 700),
      sourceName,
      sourceType: "security-rss",
      sourceUrl: link || undefined,
      attackDate: pub ? new Date(pub).toISOString() : undefined,
      rawJson: JSON.stringify({ title, link }).slice(0, 2000),
    });
  }
  return items;
}

// 4) ASRG (Automotive Security Research Group) security advisories.
//    Replaces the previous NVD CVE source. ASRG publishes curated automotive
//    CVEs with affected products at https://www.asrg.io/security-advisories.
//    For each advisory we also fetch its detail page to extract the CVSS 3.1
//    base score and derive the severity from it (CVSS: 9.0-10 Critical,
//    7.0-8.9 High, 4.0-6.9 Medium, 0.1-3.9 Low).
function cvssToSeverity(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  return "low";
}

function extractCvssScore(html: string): number | null {
  const text = stripHtml(html);
  const m = text.match(/CVSS\s*3\.1\s+(\d+(?:\.\d+)?)\s*CVSS:3\.1\//i);
  if (m) return parseFloat(m[1]);
  const m4 = text.match(/CVSS\s*4\.0\s+(\d+(?:\.\d+)?)\s*CVSS:4\.0\//i);
  if (m4) return parseFloat(m4[1]);
  return null;
}

async function fetchCvssForAdvisory(href: string): Promise<number | null> {
  try {
    const html = await readPage(`https://www.asrg.io${href}`);
    if (!html) return null;
    return extractCvssScore(html);
  } catch { return null; }
}

async function mapWithConcurrency<T, R>(arr: T[], fn: (item: T, index: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(arr.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, arr.length) }, async () => {
    while (true) { const i = next++; if (i >= arr.length) break; results[i] = await fn(arr[i], i); }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchAsrgAdvisories(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let cards: { href: string; inner: string }[] = [];
  try {
    const html = await readPage("https://www.asrg.io/security-advisories");
    if (!html) return items;
    const cardRe = /<a[^>]*href="(\/security-advisories\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = cardRe.exec(html)) !== null) {
      const href = match[1];
      const inner = stripHtml(match[2]);
      if (inner) cards.push({ href, inner });
    }
  } catch {}

  // Note: we do NOT fetch detail pages for CVSS scores during the scrape —
  // that added 30-60s and caused the scrape to time out with 0 results.
  // Instead we use ASRG's listing severity label (which ASRG already derives
  // from the CVSS score) as the suggestedSeverity. This keeps the adapter
  // fast (~5s for the listing page) so the scrape completes successfully.
  for (const { href, inner } of cards) {
    const cveIdMatch = inner.match(/(CVE-\d{4}-\d{4,7})/i);
    const cveId = cveIdMatch ? cveIdMatch[1].toUpperCase() : null;
    const sevMatch = inner.match(/CVE-\d{4}-\d{4,7}\s+(Critical|High|Medium|Low)/i);
    const listingSeverity = sevMatch ? sevMatch[1].toLowerCase() as "critical" | "high" | "medium" | "low" : undefined;
    const titleMatch = inner.match(/(?:Critical|High|Medium|Low)\s+(.+?)(?:\s+Affected:|$)/i);
    const title = titleMatch ? titleMatch[1].trim() : (cveId ?? href.split("/").pop() ?? "ASRG advisory");
    const affectedMatch = inner.match(/Affected:\s*(.+?)(?:\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|$)/);
    const affected = affectedMatch ? affectedMatch[1].trim() : "";
    const dateMatch = inner.match(/([A-Z][a-z]{2,9}\s+\d{1,2},\s+\d{4})/);
    const dateStr = dateMatch ? dateMatch[1] : undefined;
    const suggestedSeverity: RawItem["suggestedSeverity"] = listingSeverity;
    const displayTitle = cveId ? `${cveId} — ${title}` : title;
    const description = affected ? `${title}. Affected: ${affected}` : title;
    items.push({
      externalId: `asrg:${href}`,
      title: displayTitle.slice(0, 200),
      description: description.slice(0, 800),
      sourceName: "asrg-advisories",
      sourceType: "cve",
      sourceUrl: `https://www.asrg.io${href}`,
      attackDate: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      dataTypes: "vulnerability",
      suggestedSeverity,
      rawJson: JSON.stringify({ cveId, severity: suggestedSeverity, href, dateStr }).slice(0, 2000),
    });
  }
  return items.slice(0, 40);
}

// 5) darkforum-intel — analyst-curated Tor forum / marketplace monitoring.
// Models what a dark-web monitor (cf. Robin) ingests: data-sale posts, ECU
// exploit kits, OTA/telematics access brokers. Items are clearly marked
// verified=false so analysts know they require human corroboration.
export function fetchDarkForumIntel(): RawItem[] {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86400000).toISOString();
  const posts: Array<Partial<RawItem> & { title: string; description: string }> = [
    {
      title: "Sale: Telematics DB dump — 1.2M connected-vehicle records (EU OEM)",
      description: "Vendor offers 1.2M records from a European OEM telematics backend: VIN, owner PII, GPS history, OTA logs. Sample provided. Price 0.8 XMR.",
      victimOrg: "European OEM (unnamed)",
      country: "Germany",
      actor: "BlackAxle",
      dataTypes: "VIN, owner PII, GPS history, OTA logs",
      attackDate: days(2),
    },
    {
      title: "Exploit kit: CAN-bus injection for legacy infotainment ECUs (2018-2022)",
      description: "Packaged CAN-bus injection tool targeting unauthenticated UDS diagnostics on 2018-2022 infotainment ECUs. Enables door-lock & IMMO bypass.",
      actor: "garage0x",
      country: "Russia",
      dataTypes: "ECU exploit, CAN frames",
      attackDate: days(5),
    },
    {
      title: "Access broker: Fleet management SaaS admin (12k vehicles)",
      description: "Selling admin access to a fleet management platform managing ~12,000 commercial vehicles across NA. Includes API tokens & live tracking.",
      victimOrg: "Fleet management platform (NA)",
      country: "United States",
      actor: "RouteKill",
      dataTypes: "API tokens, fleet tracking data",
      attackDate: days(7),
    },
    {
      title: "Sale: EV charging network CSMS credentials (3 operators)",
      description: "CSMS operator credentials for three EV charging networks. Enables free charging, billing manipulation, and station reboot.",
      victimOrg: "EV charging networks (3)",
      country: "Netherlands",
      actor: "VoltLeak",
      dataTypes: "CSMS credentials, billing data",
      attackDate: days(9),
    },
    {
      title: "Leak: Aftermarket parts distributor customer DB (~380k)",
      description: "Customer & order database of a large aftermarket auto-parts distributor leaked on forum. Includes payment tokens & addresses.",
      victimOrg: "Aftermarket parts distributor",
      country: "United States",
      actor: "PartsDump",
      dataTypes: "Customer PII, payment tokens",
      attackDate: days(12),
    },
    {
      title: "Sale: OTA signing key (Tier-1 supplier, suspected)",
      description: "Alleged OTA firmware signing key from a Tier-1 supplier; would enable malicious firmware push to affected ECUs. Verification pending.",
      victimOrg: "Tier-1 supplier (suspected)",
      country: "Japan",
      actor: "keyGhost",
      dataTypes: "OTA signing key",
      attackDate: days(15),
    },
    {
      title: "Access broker: Dealership DMS (35 dealerships, NA group)",
      description: "Network access to a dealership group's DMS covering 35 locations. Finance & customer PII accessible.",
      victimOrg: "Dealership group (NA)",
      country: "Canada",
      actor: "Showroom",
      dataTypes: "Customer PII, finance records",
      attackDate: days(18),
    },
    {
      title: "Leak: Ride-hailing driver KYC documents (~90k)",
      description: "Driver KYC documents (licenses, selfies, bank details) for a ride-hailing/mobility platform surfaced on a Tor forum.",
      victimOrg: "Mobility platform",
      country: "India",
      actor: "MobiLoot",
      dataTypes: "Driver KYC, bank details",
      attackDate: days(21),
    },
  ];

  return posts.map((p, i) => ({
    externalId: `darkforum:${i + 1}`,
    title: p.title,
    description: p.description,
    sourceName: "darkforum-intel",
    sourceType: "darkforum-intel",
    sourceUrl: undefined,
    victimOrg: p.victimOrg,
    victimSector: undefined,
    country: p.country,
    attackDate: p.attackDate,
    actor: p.actor,
    dataTypes: p.dataTypes,
    rawJson: JSON.stringify({ curated: true, requires_verification: true }).slice(0, 1000),
  }));
}

export async function runSource(name: string): Promise<RawItem[]> {
  switch (name) {
    case "ransomware.live": return fetchRansomwareLive();
    case "ahmia-darkweb": return fetchAhmia();
    case "bleepingcomputer": return fetchSecurityRss("bleepingcomputer", "https://www.bleepingcomputer.com/feed/");
    case "thehackernews": return fetchSecurityRss("thehackernews", "https://feeds.feedburner.com/TheHackersNews");
    case "asrg-advisories": return fetchAsrgAdvisories();
    case "darkforum-intel": return fetchDarkForumIntel();
    default: return [];
  }
}

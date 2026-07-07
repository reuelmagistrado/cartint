// Dark-web & OSINT source adapters for CARTINT.
//
// Sources:
//   1. darkweb                      — unified dark-web source: Robin-style Tor search (6 engines) + RansomLook leak-site monitoring. AI-filtered for automotive only.
//   2. security-rss                 — BleepingComputer / HackerNews dark-web breach reporting
//   3. asrg-advisories              — ASRG (Automotive Security Research Group) curated automotive CVEs
//
// Each adapter returns RawItem[]; the orchestrator runs them through the AI
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
    name: "darkweb",
    type: "darkweb",
    url: "tor://darkweb-search + ransomlook.io",
    description: "Dark-web intelligence: Robin-style Tor search (6 .onion engines) + RansomLook leak-site monitoring with health checks. AI-filtered for automotive relevance only. Requires Tor for .onion scraping.",
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

// ---- Automotive keyword pre-filter -----------------------------------------

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

// Stricter keyword set for security RSS sources (BleepingComputer, HackerNews).
// These sources cover ALL cybersecurity — generic terms like "fleet", "battery",
// "wheel", "transit", "mobility" cause false positives (e.g., "fleet" in a
// server-fleet context, "battery" in a laptop-battery context). This stricter
// list requires unambiguous automotive signals.
const RSS_AUTO_KEYWORDS = [
  "automotive", "automaker", "car manufacturer", "car dealer", "dealership",
  "connected car", "connected vehicle", "electric vehicle", "ev charging",
  "charging station", "telematics", "ota update", "ota firmware",
  "can bus", "can-bus", "ecu ", "electronic control unit",
  "tier-1 supplier", "tier-2 supplier", "auto parts", "aftermarket",
  "infotainment", "adas", "autonomous driving", "robotaxi",
  "ride-hail", "ride-hailing", "car-sharing", "rental car",
  "motorcycle", "self-driving", "self driving",
  "vehicle security", "vehicle hack", "vehicle breach",
  "car theft", "car hack", "car breach",
  "truck", "trucking", "fleet management",
  "software-defined vehicle", "sdv",
  "evse", "ocpp", "csms",
];

function mentionsAuto(text: string): boolean {
  const lower = text.toLowerCase();
  return AUTO_KEYWORDS.some((k) => lower.includes(k));
}

// Stricter pre-filter for RSS sources — requires unambiguous automotive terms.
function mentionsAutoRss(text: string): boolean {
  const lower = text.toLowerCase();
  return RSS_AUTO_KEYWORDS.some((k) => lower.includes(k));
}

// ---- Source adapters --------------------------------------------------------

// 1) darkweb — unified dark-web source (RansomLook + Robin-style Tor search).
//    This adapter runs TWO sub-pipelines, both AI-filtered for automotive only:
//      a. RansomLook: search for automotive terms → health-check groups → return posts
//      b. Robin-style: search 6 .onion engines via Tor → scrape → AI classify (only if Tor available)
//    Both return results under sourceName "darkweb".
//    The orchestrator's AI classifier does the final false-positive filtering.
export async function fetchDarkweb(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>(); // dedup by externalId

  // ── Sub-pipeline A: RansomLook leak-site monitoring ──────────────────────
  // Search RansomLook with automotive-specific terms (not just "recent" posts,
  // which are mostly non-automotive). This finds targeted automotive victims.
  try {
    const { searchRansomLook, checkGroupHealth } = await import("./ransomlook");

    // Search terms that find genuine automotive victims on leak sites.
    // "car" is too broad (2121 results), so we use more specific terms.
    const searchTerms = [
      "automotive", "vehicle", "car dealer", "automaker", "fleet",
      "charging station", "telematics", "tire", "motorcycle", "truck",
      "trucking", "transport", "logistics", "Tier-1 supplier", "auto parts",
      "dealership", "EV charger", "connected vehicle",
    ];

    const allPosts: { group_name?: string; post_title: string; post_url?: string; description?: string; timestamp?: string; searchTerm: string }[] = [];
    for (const term of searchTerms) {
      try {
        const result = await searchRansomLook(term);
        if (result.posts) {
          // Take up to 15 results per search term (not all — some terms return 100+)
          for (const p of result.posts.slice(0, 15)) {
            allPosts.push({ ...p, searchTerm: term });
          }
        }
      } catch {
        // individual search term may fail; continue
      }
    }

    // Deduplicate by post_title + group_name
    const dedupedPosts: typeof allPosts = [];
    const seenPosts = new Set<string>();
    for (const p of allPosts) {
      const key = `${p.group_name}:${p.post_title}`;
      if (!seenPosts.has(key)) {
        seenPosts.add(key);
        dedupedPosts.push(p);
      }
    }

    // Pre-filter with automotive keywords to reduce AI calls.
    // Use a stricter check: require the keyword in the title or description
    // (not just the group name, which could be a false match).
    const autoPosts = dedupedPosts.filter((p) => {
      const text = `${p.post_title || ""} ${p.description || ""}`.toLowerCase();
      return mentionsAuto(text);
    });

    // For each automotive-relevant post, check the group's mirror health.
    // Only include posts from groups with available mirrors (uptime > 50%).
    // When the post has no direct URL, construct one from the group's best mirror
    // (the .onion address from the health check).
    for (const post of autoPosts.slice(0, 50)) {
      if (!post.group_name) continue;
      const health = await checkGroupHealth(post.group_name);
      if (health.available || health.avg_uptime_30d > 50) {
        const extId = `darkweb:rl:${post.group_name}:${post.post_title?.slice(0, 50)}`;
        if (seen.has(extId)) continue;
        seen.add(extId);
        // Build the source URL: use the post_url if available, otherwise
        // link to the group's best mirror (.onion leak site).
        const sourceUrl = post.post_url || health.best_mirror || undefined;
        items.push({
          externalId: extId,
          title: `${post.post_title} — ransomware leak (${post.group_name})`,
          description: post.description || post.post_title || `Ransomware group ${post.group_name} claims breach of ${post.post_title}.`,
          sourceName: "darkweb",
          sourceType: "darkweb",
          sourceUrl,
          victimOrg: post.post_title,
          actor: post.group_name,
          attackDate: post.timestamp || new Date().toISOString(),
          dataTypes: "claimed exfiltrated data",
          rawJson: JSON.stringify({
            source: "ransomlook",
            group: post.group_name,
            searchTerm: post.searchTerm,
            health: { available: health.available, uptime: health.avg_uptime_30d, bestMirror: health.best_mirror },
            description: post.description,
          }).slice(0, 2000),
        });
      }
    }
  } catch {
    // RansomLook may be unavailable; continue to Robin-style pipeline.
  }

  // ── Sub-pipeline B: Robin-style Tor search ───────────────────────────────
  // Search 6 dark-web search engines via Tor, then AI-filter.
  // Only runs if Tor is available (local deployment with Tor running).
  try {
    const { isTorAvailable } = await import("./tor");
    if (isTorAvailable()) {
      const { searchDarkWeb } = await import("./darkweb-search");
      const { scrapeUrls } = await import("./darkweb-scrape");
      const { refineQuery, filterResults, classifyBatch, isAccepted } = await import("./darkweb-llm-filter");

      const refinedQuery = await refineQuery("automotive ECU exploit vehicle data");
      const searchResults = await searchDarkWeb(refinedQuery);
      if (searchResults.length > 0) {
        const filtered = await filterResults(searchResults, 20);
        const urls = filtered.map((r) => r.link);
        const scraped = await scrapeUrls(urls);
        const pages = Object.entries(scraped).map(([url, content]) => ({ url, content }));
        if (pages.length > 0) {
          const classifications = await classifyBatch(pages);
          for (const { url, classification } of classifications) {
            if (isAccepted(classification) && classification) {
              const extId = `darkweb:robin:${url}`;
              if (seen.has(extId)) continue;
              seen.add(extId);
              items.push({
                externalId: extId,
                title: classification.victim
                  ? `${classification.victim} — dark-web threat (${classification.threat_actor || "unknown"})`
                  : `Dark-web threat — ${classification.threat_actor || "unknown"}`,
                description: classification.reasoning.slice(0, 1200),
                sourceName: "darkweb",
                sourceType: "darkweb",
                sourceUrl: url,
                victimOrg: classification.victim || undefined,
                country: classification.country || undefined,
                actor: classification.threat_actor || undefined,
                dataTypes: classification.data_types.join(", ") || undefined,
                suggestedSeverity: classification.confidence >= 90 ? "critical" : classification.confidence >= 75 ? "high" : classification.confidence >= 60 ? "medium" : "low",
                rawJson: JSON.stringify({ source: "robin", classification, url }).slice(0, 4000),
              });
            }
          }
        }
      }
    }
  } catch {
    // Tor not available or search failed; RansomLook results still returned.
  }

  return items;
}

// 3) Security RSS — generic parser used by bleepingcomputer & thehackernews.
export async function fetchSecurityRss(sourceName: string, feedUrl: string): Promise<RawItem[]> {
  // Some feeds (e.g. BleepingComputer) are behind Cloudflare and return a
  // challenge page instead of XML when fetched directly. Use the z-ai
  // page_reader as a fallback if the direct fetch doesn't return valid XML.
  let xml = "";
  try {
    const res = await fetchWithTimeout(feedUrl);
    if (res.ok) {
      const text = await res.text();
      // Check if it's valid XML (RSS/Atom) and not a Cloudflare challenge page
      if (text.includes("<item>") || text.includes("<entry>")) {
        xml = text;
      }
    }
  } catch {
    // direct fetch failed
  }
  // Fallback: use page_reader (bypasses Cloudflare)
  if (!xml) {
    try {
      xml = await readPage(feedUrl);
    } catch {
      // page_reader also failed
    }
  }
  if (!xml) return [];

  const items: RawItem[] = [];
  // Match both RSS <item> and Atom <entry> elements
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  const matches = xml.match(itemRegex) ?? [];
  for (const block of matches.slice(0, 40)) {
    const title = block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
      ?? block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    // Link: try <link>text</link> (RSS), <link href="..."/> (Atom), <feedburner:origLink>text</feedburner:origLink>
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim()
      ?? block.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim()
      ?? block.match(/<feedburner:origLink>([\s\S]*?)<\/feedburner:origLink>/i)?.[1]?.trim()
      ?? "";
    const desc = block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1]
      ?? block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? block.match(/<summary[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/summary>/i)?.[1]
      ?? block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ?? "";
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? block.match(/<published>([\s\S]*?)<\/published>/i)?.[1]
      ?? block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1];
    const cleanDesc = stripHtml(desc);
    const text = `${title} ${cleanDesc}`;
    if (!mentionsAutoRss(text)) continue;
    // Only include items with a specific article URL (not the generic homepage)
    const articleUrl = link && link.startsWith("http") && !link.match(/^https?:\/\/[^/]+\/?$/i) ? link : undefined;
    items.push({
      externalId: `${sourceName}:${articleUrl || link || title}`.slice(0, 200),
      title: stripHtml(title).slice(0, 180),
      description: cleanDesc.slice(0, 700),
      sourceName,
      sourceType: "security-rss",
      sourceUrl: articleUrl,
      attackDate: pub ? new Date(pub).toISOString() : undefined,
      rawJson: JSON.stringify({ title, link: articleUrl }).slice(0, 2000),
    });
  }
  return items;
}

// 4) ASRG (Automotive Security Research Group) security advisories.
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

// ---- Source router ----------------------------------------------------------

export async function runSource(name: string): Promise<RawItem[]> {
  switch (name) {
    case "darkweb": return fetchDarkweb();
    case "bleepingcomputer": return fetchSecurityRss("bleepingcomputer", "https://www.bleepingcomputer.com/feed/");
    case "thehackernews": return fetchSecurityRss("thehackernews", "https://feeds.feedburner.com/TheHackersNews");
    case "asrg-advisories": return fetchAsrgAdvisories();
    default: return [];
  }
}

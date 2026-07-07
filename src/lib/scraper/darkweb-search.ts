// Dark-web search module — searches multiple Tor hidden-service search engines.
// Queries multiple .onion search engines
// concurrently, extracts .onion links from the HTML results, deduplicates
// by URL, and returns a list of {title, link} dicts.
// Search engines are .onion URLs that may require Tor. If Tor is not running,
// the search falls back to clearnet gateways (Ahmia) where available.

import { fetchViaTor, isOnionUrl } from "./tor";
import * as cheerio from "cheerio";

export type SearchResult = {
 title: string;
 link: string;
};

// Dark-web search engines (we support the most reliable ones).
// .onion URLs require Tor; clearnet fallbacks are used when Tor is unavailable.
type SearchEngine = {
 name: string;
 url: string; // .onion URL with {query} placeholder
 clearnetUrl?: string; // clearnet fallback
 linkSelector: string; // CSS selector for <a> tags in results
};

const SEARCH_ENGINES: SearchEngine[] = [
 {
 name: "Ahmia",
 url: "http://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion/search/?q={query}",
 clearnetUrl: "https://ahmia.fi/search/?q={query}",
 linkSelector: "li.searchResult a, .results a, a.onion",
 },
 {
 name: "OnionLand",
 url: "http://3bbba7cphcav6bbg.onion/search?q={query}",
 clearnetUrl: "https://www.onionland.io/search?q={query}",
 linkSelector: "a[href*='.onion']",
 },
 {
 name: "Tor66",
 url: "http://tor66sejgdnr4xg7y53vhkq5x5vphqoboqxxc3y7g4c4njgkpsxq7gyd.onion/search.php?q={query}",
 linkSelector: "a[href*='.onion']",
 },
 {
 name: "Torgle",
 url: "http://torgle5gk6b7jd3h.onion/search?q={query}",
 linkSelector: "a[href*='.onion']",
 },
 {
 name: "Kaizer",
 url: "http://kaizeronion2pv2xmqng7ucd3w4fjcjjtfflr5vh3ktdxv5x7c2qawd.onion/search?q={query}",
 linkSelector: "a[href*='.onion']",
 },
 {
 name: "DarkSearch",
 url: "http://darksearch7ggyugv.onion/search?query={query}",
 linkSelector: "a[href*='.onion']",
 },
];

// Search a single engine and extract .onion links from the HTML results.
async function searchEngine(engine: SearchEngine, query: string): Promise<SearchResult[]> {
 const encodedQuery = encodeURIComponent(query);
 const onionUrl = engine.url.replace("{query}", encodedQuery);
 const clearnetUrl = engine.clearnetUrl?.replace("{query}", encodedQuery);

 // Try the .onion URL first (via Tor), then fall back to clearnet if available.
 let result = await fetchViaTor(onionUrl);
 if (!result && clearnetUrl) {
 // Clearnet fallback (no proxy)
 try {
 const res = await fetch(clearnetUrl, {
 headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
 signal: AbortSignal.timeout(15000),
 });
 if (res.ok) {
 const contentType = res.headers.get("content-type") || "";
 if (contentType.includes("text/html") || contentType.includes("text/plain")) {
 const body = await res.text();
 result = { status: 200, body, contentType };
 }
 }
 } catch {
 // engine unavailable
 }
 }

 if (!result || !result.body) return [];

 // Parse HTML with cheerio and extract <a> tags with .onion hrefs
 const $ = cheerio.load(result.body);
 const results: SearchResult[] = [];

 $(engine.linkSelector).each((_, el) => {
 const href = $(el).attr("href");
 const title = $(el).text().trim();
 if (!href) return;

 // Extract the .onion URL from the href (may be a redirect URL)
 const onionMatch = href.match(/(https?:\/\/[a-z0-9]{16,56}\.onion[^\s"'<>]*)/i);
 const onionUrl = onionMatch ? onionMatch[1] : href.startsWith("http") ? href : "";

 if (!onionUrl || !isOnionUrl(onionUrl)) return;

 // Strip trailing slashes for deduplication
 const normalized = onionUrl.replace(/\/+$/, "");

 results.push({
 title: title.slice(0, 200) || normalized,
 link: normalized,
 });
 });

 return results;
}

// Search all engines concurrently and return deduplicated results.
// we use Promise.all with
// the same concurrency.
export async function searchDarkWeb(query: string, maxWorkers = 5): Promise<SearchResult[]> {
 // Run searches concurrently (limited by maxWorkers via chunking)
 const allResults: SearchResult[] = [];
 const seen = new Set<string>();

 // Process engines in chunks of maxWorkers
 for (let i = 0; i < SEARCH_ENGINES.length; i += maxWorkers) {
 const chunk = SEARCH_ENGINES.slice(i, i + maxWorkers);
 const chunkResults = await Promise.allSettled(chunk.map((engine) => searchEngine(engine, query)));

 for (const r of chunkResults) {
 if (r.status === "fulfilled") {
 for (const item of r.value) {
 // Deduplicate by URL (stripped of trailing slashes)
 if (!seen.has(item.link)) {
 seen.add(item.link);
 allResults.push(item);
 }
 }
 }
 }
 }

 return allResults;
}

export { SEARCH_ENGINES };

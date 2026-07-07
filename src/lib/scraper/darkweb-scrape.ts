// Dark-web scrape module — fetches .onion pages via Tor and extracts clean text.
// 
// - Thread-safe sessions (one per protocol: Tor vs clearnet)
// - .onion URLs → Tor SOCKS5 proxy; others → direct
// - Timeouts: Tor (10 connect, 45 read), clearnet (5 connect, 25 read)
// - Stream response, cap download at 1MB
// - Only process HTML content types
// - Extract text with cheerio: remove <script>/<style>, get text, normalize
// - Cap extracted text at 50,000 chars, return at 2,000 chars max
// - Concurrent scraping (max_workers=5), deduplicate URLs first

import { fetchViaTor, isOnionUrl } from "./tor";
import * as cheerio from "cheerio";

const MAX_EXTRACTED_TEXT = parseInt(process.env.MAX_EXTRACTED_TEXT || "50000", 10);
const MAX_RETURN_CHARS = parseInt(process.env.MAX_RETURN_CHARS || "2000", 10);
const SCRAPE_MAX_WORKERS = parseInt(process.env.SCRAPE_MAX_WORKERS || "5", 10);

// Scrape a single URL and return cleaned text (max 2000 chars).
export async function scrapeUrl(url: string): Promise<string | null> {
 const result = await fetchViaTor(url);
 if (!result || !result.body) return null;

 // Parse HTML and extract text (BeautifulSoup get_text)
 const $ = cheerio.load(result.body);

 // Remove script and style tags
 $("script, style, noscript, iframe, svg").remove();

 // Extract text and normalize whitespace
 let text = $("body").text() || $.text();
 text = text.replace(/\s+/g, " ").trim();

 // Cap at MAX_EXTRACTED_TEXT, then return at MAX_RETURN_CHARS
 if (text.length > MAX_EXTRACTED_TEXT) {
 text = text.slice(0, MAX_EXTRACTED_TEXT);
 }
 if (text.length > MAX_RETURN_CHARS) {
 text = text.slice(0, MAX_RETURN_CHARS);
 }

 return text || null;
}

// Scrape multiple URLs concurrently (max_workers=5).
// Returns a dict {url: scraped_text} — only URLs that produced text are included.
export async function scrapeUrls(urls: string[]): Promise<Record<string, string>> {
 // Deduplicate URLs first
 const uniqueUrls = [...new Set(urls)];
 const results: Record<string, string> = {};

 // Process in chunks of SCRAPE_MAX_WORKERS for concurrency control
 for (let i = 0; i < uniqueUrls.length; i += SCRAPE_MAX_WORKERS) {
 const chunk = uniqueUrls.slice(i, i + SCRAPE_MAX_WORKERS);
 const chunkResults = await Promise.allSettled(
 chunk.map(async (url) => {
 const text = await scrapeUrl(url);
 return { url, text };
 }),
 );

 for (const r of chunkResults) {
 if (r.status === "fulfilled" && r.value.text) {
 results[r.value.url] = r.value.text;
 }
 }
 }

 return results;
}

export { isOnionUrl };

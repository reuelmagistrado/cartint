// Tor SOCKS5 proxy helper for dark-web scraping.
// Provides a configured `fetch` that routes through the Tor SOCKS5 proxy
// (socks5h://127.0.0.1:9050 by default) for .onion URLs, with:
// - Retry with exponential backoff (3 retries, 0.5 backoff factor)
// - Rotating User-Agents (9 browser UAs, )
// - Configurable timeouts (Tor: 45s, clearnet: 25s)
// - 1MB download cap (streamed)
// For clearnet URLs, fetches directly (no proxy).
// If Tor is not running, .onion fetches fail gracefully (caller handles).

import { SocksProxyAgent } from "socks-proxy-agent";
import { Readable } from "stream";

const TOR_HOST = process.env.TOR_SOCKS_HOST || "127.0.0.1";
const TOR_PORT = parseInt(process.env.TOR_SOCKS_PORT || "9050", 10);
const MAX_DOWNLOAD_BYTES = parseInt(process.env.MAX_DOWNLOAD_BYTES || "1000000", 10);
const SCRAPE_TIMEOUT_TOR = parseInt(process.env.SCRAPE_TIMEOUT_TOR || "45", 10) * 1000;

// 9 rotating User-Agents ()
const USER_AGENTS = [
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:121.0) Gecko/20100101 Firefox/121.0",
 "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
 "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
 "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
];

let uaIndex = 0;

function getNextUserAgent(): string {
 const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
 uaIndex++;
 return ua;
}

// Singleton Tor proxy agent (created lazily on first .onion request).
let torAgent: SocksProxyAgent | null = null;

function getTorAgent(): SocksProxyAgent {
 if (!torAgent) {
 // socks5h:// means DNS resolution happens on the Tor side (important for .onion)
 torAgent = new SocksProxyAgent(`socks5h://${TOR_HOST}:${TOR_PORT}`);
 }
 return torAgent;
}

export function isOnionUrl(url: string): boolean {
 try {
 const u = new URL(url);
 return u.hostname.endsWith(".onion");
 } catch {
 return false;
 }
}

export function isTorAvailable(): boolean {
 // Check if Tor proxy env vars are configured. Actual connectivity is tested
 // on first request — this is just a config check.
 return !!TOR_HOST && TOR_PORT > 0;
}

// Retry config (3 retries, backoff 0.5, retry on 500/502/503/504)
const MAX_RETRIES = 3;
const BACKOFF_FACTOR = 0.5;
const RETRY_STATUS_CODES = new Set([500, 502, 503, 504]);

// Fetch a URL through Tor (for .onion) or directly (for clearnet).
// Streams the response and caps the download at MAX_DOWNLOAD_BYTES.
// Returns the response body as a string, or null on failure.
export async function fetchViaTor(
 url: string,
 opts: { timeoutMs?: number } = {},
): Promise<{ status: number; body: string; contentType: string } | null> {
 const timeout = opts.timeoutMs ?? SCRAPE_TIMEOUT_TOR;
 const isOnion = isOnionUrl(url);

 for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
 try {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeout);

 const fetchOpts: RequestInit & { agent?: SocksProxyAgent } = {
 method: "GET",
 headers: {
 "User-Agent": getNextUserAgent(),
 Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
 },
 signal: controller.signal,
 };

 // Route .onion URLs through the Tor SOCKS5 proxy.
 // Note: Node.js fetch doesn't natively support SOCKS proxy agents.
 // We use the socks-proxy-agent with Node's https module for .onion URLs,
 // and native fetch for clearnet URLs.
 if (isOnion) {
 return await fetchOnionViaAgent(url, fetchOpts, timeout);
 }

 const res = await fetch(url, fetchOpts);
 clearTimeout(timer);

 if (RETRY_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
 await sleep(Math.pow(BACKOFF_FACTOR, attempt) * 1000);
 continue;
 }

 if (!res.ok) return null;

 const contentType = res.headers.get("content-type") || "";
 // Only process HTML/text content types
 if (!isHtmlContentType(contentType)) return null;

 // Stream + cap at MAX_DOWNLOAD_BYTES
 const body = await streamWithCap(res, MAX_DOWNLOAD_BYTES);
 return { status: res.status, body, contentType };
 } catch {
 if (attempt < MAX_RETRIES) {
 await sleep(Math.pow(BACKOFF_FACTOR, attempt) * 1000);
 continue;
 }
 return null;
 }
 }
 return null;
}

// Fetch an .onion URL using the socks-proxy-agent with Node's https module.
async function fetchOnionViaAgent(
 url: string,
 opts: RequestInit,
 timeoutMs: number,
): Promise<{ status: number; body: string; contentType: string } | null> {
 // Dynamic import of node:https to avoid bundler issues
 const https = await import("https");
 const http = await import("http");

 return new Promise((resolve) => {
 const agent = getTorAgent();
 const urlObj = new URL(url);
 const lib = urlObj.protocol === "https:" ? https : http;

 const req = lib.get(
 url,
 {
 agent,
 headers: opts.headers as Record<string, string>,
 timeout: timeoutMs,
 },
 (res) => {
 if (res.statusCode === undefined) {
 resolve(null);
 return;
 }

 if (RETRY_STATUS_CODES.has(res.statusCode)) {
 res.destroy();
 resolve(null);
 return;
 }

 if (res.statusCode < 200 || res.statusCode >= 300) {
 res.destroy();
 resolve(null);
 return;
 }

 const contentType = res.headers["content-type"] || "";
 if (!isHtmlContentType(contentType)) {
 res.destroy();
 resolve(null);
 return;
 }

 // Stream + cap
 const chunks: Buffer[] = [];
 let totalBytes = 0;
 let capped = false;

 res.on("data", (chunk: Buffer) => {
 if (capped) return;
 totalBytes += chunk.length;
 if (totalBytes > MAX_DOWNLOAD_BYTES) {
 capped = true;
 chunks.push(chunk.subarray(0, MAX_DOWNLOAD_BYTES - (totalBytes - chunk.length)));
 res.destroy();
 return;
 }
 chunks.push(chunk);
 });

 res.on("end", () => {
 resolve({
 status: res.statusCode!,
 body: Buffer.concat(chunks).toString("utf-8"),
 contentType,
 });
 });

 res.on("error", () => resolve(null));
 },
 );

 req.on("error", () => resolve(null));
 req.on("timeout", () => {
 req.destroy();
 resolve(null);
 });
 });
}

function isHtmlContentType(ct: string): boolean {
 const lower = ct.toLowerCase();
 return (
 lower.includes("text/html") ||
 lower.includes("application/xhtml+xml") ||
 lower.includes("text/plain")
 );
}

async function streamWithCap(res: Response, maxBytes: number): Promise<string> {
 const reader = res.body?.getReader();
 if (!reader) return "";
 const chunks: Uint8Array[] = [];
 let total = 0;
 for (;;) {
 const { done, value } = await reader.read();
 if (done) break;
 total += value.length;
 if (total > maxBytes) {
 chunks.push(value.subarray(0, maxBytes - (total - value.length)));
 break;
 }
 chunks.push(value);
 }
 return new TextDecoder().decode(Buffer.concat(chunks));
}

function sleep(ms: number): Promise<void> {
 return new Promise((r) => setTimeout(r, ms));
}

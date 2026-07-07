// Dark-web AI filter module — 3-step AI pipeline ().
// Step 1 — Query Refinement: refine the user's search query into ≤5 words
// optimized for dark-web search engines.
// Step 2 — Result Filtering: from all search results, select the top 20 most
// relevant for automotive threat intelligence.
// Step 3 — Automotive Relevance Classification: for each scraped page, determine
// if it's a genuine automotive threat (not a false positive) with a
// confidence score, and extract structured data (actor, victim, etc.).
// Uses the z-ai-web-dev-sdk (the project's default AI). For multi-model
// support (OpenAI/Anthropic/Gemini/Ollama), users can set the corresponding
// env vars and the filter will use the configured provider.

import { chatCompletionText } from "@/lib/ai-provider";
import type { SearchResult } from "./darkweb-search";

export type ClassificationResult = {
 automotive_relevant: boolean;
 confidence: number;
 false_positive: boolean;
 threat_actor: string;
 victim: string;
 country: string;
 data_types: string[];
 atm_tactic: string;
 reasoning: string;
};

// ─── Step 1: Query Refinement ──────────────────────────────────────────────
// System prompt: "You are a Cybercrime Threat Intelligence Expert.
// Refine the provided user query for dark web search engines. Don't use
// logical operators. Keep to 5 words or less. Output just the query."

export async function refineQuery(userQuery: string): Promise<string> {
 try {
 const refined = (
 await chatCompletionText({
 messages: [
 {
 role: "assistant",
 content:
 "You are a Cybercrime Threat Intelligence Expert. Refine the provided user query for dark web search engines. Don't use logical operators. Keep to 5 words or less. Output just the query.",
 },
 { role: "user", content: userQuery },
 ],
 thinking: { type: "disabled" },
 })
 ).trim();
 return refined || userQuery;
 } catch {
 return userQuery;
 }
}

// ─── Step 2: Result Filtering ──────────────────────────────────────────────
// From all search results, select the top 20 most relevant for automotive
// threat intelligence. Truncate links at .onion and clean titles.

export async function filterResults(
 results: SearchResult[],
 maxResults = 20,
): Promise<SearchResult[]> {
 if (results.length <= maxResults) return results;

 try {
 // Truncate links at .onion () and clean titles
 const cleaned = results.map((r, i) => ({
 index: i,
 title: r.title.slice(0, 100),
 link: r.link.split(".onion")[0] + ".onion",
 }));

 const raw = await chatCompletionText({
 messages: [
 {
 role: "assistant",
 content: `You are an Automotive Threat Intelligence Analyst. From the following dark-web search results, select the top ${maxResults} most relevant to automotive/connected-vehicle threats. Consider: OEM breaches, telematics data sales, ECU exploits, OTA attacks, CAN-bus tools, fleet management access, vehicle data dumps, charging network exploits, Tier-1 supplier attacks. Return ONLY a JSON array of index numbers, e.g. [0, 3, 5, ...]`,
 },
 { role: "user", content: JSON.stringify(cleaned) },
 ],
 thinking: { type: "disabled" },
 });

 const rawStr = raw || "[]";
 const match = raw.match(/\[[\s\S]*\]/);
 const indices: number[] = match ? JSON.parse(match[0]) : [];
 return indices
 .filter((i) => i >= 0 && i < results.length)
 .slice(0, maxResults)
 .map((i) => results[i]);
 } catch {
 // If AI fails, return the first maxResults
 return results.slice(0, maxResults);
 }
}

// ─── Step 3: Automotive Relevance Classification ───────────────────────────
// CARTINT-specific: classify each scraped page for automotive relevance,
// confidence, false-positive check, and extract structured data.

const CLASSIFICATION_SYSTEM_PROMPT = `You are an Automotive Threat Intelligence Analyst. Analyze the following dark-web content and determine:

1. AUTOMOTIVE RELEVANCE: Is this content related to automotive/connected-vehicle threats?
 Consider: OEM breaches, telematics data sales, ECU exploits, OTA attacks, CAN-bus tools,
 fleet management access, vehicle data dumps, charging network exploits, Tier-1 supplier attacks.
 Respond: RELEVANT / NOT_RELEVANT / UNCERTAIN

2. CONFIDENCE SCORE: 0-100% confidence that this is a genuine automotive threat (not false positive)

3. FALSE POSITIVE CHECK: Could this be a false positive? Consider:
 - Is the "automotive" keyword match coincidental? (e.g., "car" in a username)
 - Is the content about generic malware with no vehicle connection?
 - Is the threat actor known for non-automotive activity?
 - Is the data being sold actually vehicle-related or just generic PII?

4. EXTRACT: threat actor name, victim organization, country, data types, ATM tactic (if applicable)

5. REASONING: One paragraph explaining the classification

Output as JSON:
{
 "automotive_relevant": true/false,
 "confidence": 0-100,
 "false_positive": true/false,
 "threat_actor": "...",
 "victim": "...",
 "country": "...",
 "data_types": ["..."],
 "atm_tactic": "...",
 "reasoning": "..."
}`;

export async function classifyDarkwebContent(
 url: string,
 content: string,
): Promise<ClassificationResult | null> {
 try {
 const raw = await chatCompletionText({
 messages: [
 { role: "assistant", content: CLASSIFICATION_SYSTEM_PROMPT },
 { role: "user", content: `URL: ${url}\n\nContent:\n${content}` },
 ],
 thinking: { type: "disabled" },
 });

 const match = raw.match(/\{[\s\S]*\}/);
 const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
 return normalizeClassification(parsed);
 } catch {
 return null;
 }
}

// Classify multiple pages concurrently (chunks of 5).
export async function classifyBatch(
 pages: { url: string; content: string }[],
): Promise<{ url: string; classification: ClassificationResult | null }[]> {
 const results: { url: string; classification: ClassificationResult | null }[] = [];

 for (let i = 0; i < pages.length; i += 5) {
 const chunk = pages.slice(i, i + 5);
 const chunkResults = await Promise.allSettled(
 chunk.map(async (p) => ({
 url: p.url,
 classification: await classifyDarkwebContent(p.url, p.content),
 })),
 );
 for (const r of chunkResults) {
 if (r.status === "fulfilled") results.push(r.value);
 }
 }

 return results;
}

function normalizeClassification(parsed: Record<string, unknown>): ClassificationResult {
 return {
 automotive_relevant: Boolean(parsed.automotive_relevant),
 confidence: clampInt(Number(parsed.confidence), 0, 100),
 false_positive: Boolean(parsed.false_positive),
 threat_actor: String(parsed.threat_actor || ""),
 victim: String(parsed.victim || ""),
 country: String(parsed.country || ""),
 data_types: Array.isArray(parsed.data_types)
 ? parsed.data_types.map(String)
 : parsed.data_types
 ? [String(parsed.data_types)]
 : [],
 atm_tactic: String(parsed.atm_tactic || ""),
 reasoning: String(parsed.reasoning || ""),
 };
}

function clampInt(n: number, min: number, max: number): number {
 if (!Number.isFinite(n)) return min;
 return Math.max(min, Math.min(max, Math.round(n)));
}

// ─── Acceptance gate ────────────────────────────────────────────────────────
// Only items where automotive_relevant == true AND false_positive == false
// AND confidence >= 70 should be accepted into the threat feed.
export const MIN_CONFIDENCE = 70;

export function isAccepted(c: ClassificationResult | null): boolean {
 if (!c) return false;
 return c.automotive_relevant && !c.false_positive && c.confidence >= MIN_CONFIDENCE;
}

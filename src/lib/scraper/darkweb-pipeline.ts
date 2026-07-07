// Dark-web scraper orchestrator — the full pipeline:
//   1. Refine the user's search query via AI
//   2. Search dark-web search engines via Tor (Ahmia, OnionLand, Tor66, etc.)
//   3. Filter search results via AI (top 20 most relevant)
//   4. For each result URL that matches a known ransomware group:
//      a. Check RansomLook /api/health/{group_name}
//      b. If best_mirror exists and uptime_30d > 50%: scrape the mirror via Tor
//      c. Else: skip and log "mirror down"
//   5. For results not matching a known group: scrape directly via Tor
//   6. For each scraped page: run AI automotive relevance classification
//   7. Accept only if: relevant AND not false positive AND confidence ≥ 70%
//   8. Return accepted threats as RawItem[] for the orchestrator to persist

import { searchDarkWeb, type SearchResult } from "./darkweb-search";
import { scrapeUrls } from "./darkweb-scrape";
import {
  refineQuery,
  filterResults,
  classifyBatch,
  isAccepted,
  type ClassificationResult,
} from "./darkweb-llm-filter";
import {
  checkGroupHealth,
  extractGroupNameFromOnion,
} from "./ransomlook";
import { isTorAvailable } from "./tor";
import type { RawItem } from "./classifier";

export type DarkwebScrapeProgress = {
  stage: "refining" | "searching" | "filtering" | "health-check" | "scraping" | "classifying" | "done" | "error";
  message: string;
  query?: string;
  searchResults?: number;
  filteredResults?: number;
  scrapedPages?: number;
  accepted?: number;
  rejected?: number;
  skippedMirrors?: number;
};

export type DarkwebScrapeResult = {
  ok: boolean;
  query: string;
  refinedQuery: string;
  searchResults: number;
  filteredResults: number;
  scrapedPages: number;
  accepted: number;
  rejected: number;
  skippedMirrors: number;
  threats: RawItem[];
  error?: string;
  progress: DarkwebScrapeProgress[];
};

// Run the full dark-web scraper pipeline.
// If Tor is not running, returns an error (the pipeline requires Tor for .onion).
export async function runDarkwebPipeline(
  userQuery: string,
  onProgress?: (p: DarkwebScrapeProgress) => void,
): Promise<DarkwebScrapeResult> {
  const progress: DarkwebScrapeProgress[] = [];
  const emit = (p: DarkwebScrapeProgress) => {
    progress.push(p);
    onProgress?.(p);
  };

  // Check Tor availability
  if (!isTorAvailable()) {
    emit({ stage: "error", message: "Tor SOCKS5 proxy not configured. Set TOR_SOCKS_HOST/TOR_SOCKS_PORT in .env and start Tor." });
    return { ok: false, query: userQuery, refinedQuery: userQuery, searchResults: 0, filteredResults: 0, scrapedPages: 0, accepted: 0, rejected: 0, skippedMirrors: 0, threats: [], error: "Tor not configured", progress };
  }

  // Step 1: Refine the query
  emit({ stage: "refining", message: `Refining query: "${userQuery}"`, query: userQuery });
  const refinedQuery = await refineQuery(userQuery);
  emit({ stage: "refining", message: `Refined query: "${refinedQuery}"`, query: refinedQuery });

  // Step 2: Search dark-web search engines
  emit({ stage: "searching", message: `Searching dark-web engines for: "${refinedQuery}"` });
  const searchResults = await searchDarkWeb(refinedQuery);
  emit({ stage: "searching", message: `Found ${searchResults.length} results`, searchResults: searchResults.length });

  if (searchResults.length === 0) {
    emit({ stage: "done", message: "No search results found", searchResults: 0 });
    return { ok: true, query: userQuery, refinedQuery, searchResults: 0, filteredResults: 0, scrapedPages: 0, accepted: 0, rejected: 0, skippedMirrors: 0, threats: [], progress };
  }

  // Step 3: Filter results via AI (top 20 most relevant)
  emit({ stage: "filtering", message: `Filtering ${searchResults.length} results via AI...` });
  const filtered = await filterResults(searchResults, 20);
  emit({ stage: "filtering", message: `Selected ${filtered.length} relevant results`, filteredResults: filtered.length });

  // Step 4: RansomLook health checks for known ransomware group URLs
  emit({ stage: "health-check", message: "Checking RansomLook mirror health..." });
  const urlsToScrape: string[] = [];
  let skippedMirrors = 0;

  for (const result of filtered) {
    const groupName = extractGroupNameFromOnion(result.link);
    if (groupName) {
      // Check RansomLook health before scraping
      const health = await checkGroupHealth(groupName);
      if (health.available && health.best_mirror && health.avg_uptime_30d > 50) {
        urlsToScrape.push(result.link);
      } else {
        skippedMirrors++;
      }
    } else {
      // Not a known ransomware group — scrape directly
      urlsToScrape.push(result.link);
    }
  }
  emit({ stage: "health-check", message: `${urlsToScrape.length} URLs to scrape, ${skippedMirrors} mirrors skipped`, skippedMirrors });

  // Step 5: Scrape pages via Tor
  emit({ stage: "scraping", message: `Scraping ${urlsToScrape.length} pages via Tor...` });
  const scrapedPages = await scrapeUrls(urlsToScrape);
  const pageEntries = Object.entries(scrapedPages);
  emit({ stage: "scraping", message: `Scraped ${pageEntries.length} pages`, scrapedPages: pageEntries.length });

  if (pageEntries.length === 0) {
    emit({ stage: "done", message: "No pages could be scraped (Tor may be down or pages unreachable)" });
    return { ok: true, query: userQuery, refinedQuery, searchResults: searchResults.length, filteredResults: filtered.length, scrapedPages: 0, accepted: 0, rejected: 0, skippedMirrors, threats: [], progress };
  }

  // Step 6: AI automotive relevance classification
  emit({ stage: "classifying", message: `Classifying ${pageEntries.length} pages for automotive relevance...` });
  const classifications = await classifyBatch(
    pageEntries.map(([url, content]) => ({ url, content })),
  );

  // Step 7: Accept only relevant, non-false-positive, high-confidence items
  const threats: RawItem[] = [];
  let accepted = 0;
  let rejected = 0;

  for (const { url, classification } of classifications) {
    if (isAccepted(classification)) {
      accepted++;
      threats.push(classificationToRawItem(url, classification!));
    } else {
      rejected++;
    }
  }

  emit({ stage: "classifying", message: `${accepted} accepted, ${rejected} rejected`, accepted, rejected });
  emit({ stage: "done", message: `Pipeline complete: ${accepted} automotive threats found`, accepted, rejected });

  return {
    ok: true,
    query: userQuery,
    refinedQuery,
    searchResults: searchResults.length,
    filteredResults: filtered.length,
    scrapedPages: pageEntries.length,
    accepted,
    rejected,
    skippedMirrors,
    threats,
    progress,
  };
}

// Convert an AI classification result to a RawItem for the orchestrator.
function classificationToRawItem(url: string, c: ClassificationResult): RawItem {
  return {
    externalId: `darkweb:${url}`,
    title: c.victim
      ? `${c.victim} — dark-web threat (${c.threat_actor || "unknown actor"})`
      : `Dark-web threat — ${c.threat_actor || "unknown"}`,
    description: c.reasoning.slice(0, 1200),
    sourceName: "darkweb-scraper",
    sourceType: "darkweb-scraper",
    sourceUrl: url,
    victimOrg: c.victim || undefined,
    country: c.country || undefined,
    actor: c.threat_actor || undefined,
    dataTypes: c.data_types.join(", ") || undefined,
    suggestedSeverity: c.confidence >= 90 ? "critical" : c.confidence >= 75 ? "high" : c.confidence >= 60 ? "medium" : "low",
    rawJson: JSON.stringify({ classification: c, url }).slice(0, 4000),
  };
}

// Scrape orchestrator: runs source adapters, classifies with the LLM,
// persists threats (deduped by externalId), updates source status, and writes
// ScrapeLog entries tracking accepted vs rejected (false-positive) counts.
import { db } from "@/lib/db";
import { classifyBatch, type RawItem } from "./classifier";
import { SOURCE_DEFS, runSource } from "./sources";

// The automotive-relevance confidence threshold. Only items with
// isAutomotive=true AND relevanceScore>=THRESHOLD surface as real threats.
export const RELEVANCE_THRESHOLD = 70;

export type ScrapeResult = {
  source: string;
  status: "ok" | "error" | "degraded" | "empty";
  fetched: number;
  accepted: number;
  rejected: number;
  error?: string;
  durationMs: number;
};

export async function ensureSourcesSeeded() {
  const count = await db.source.count();
  if (count > 0) return;
  await db.source.createMany({
    data: SOURCE_DEFS.map((s) => ({
      name: s.name,
      type: s.type,
      url: s.url,
      description: s.description,
      isDarkWeb: s.isDarkWeb,
      enabled: true,
    })),
  });
}

export async function scrapeSource(name: string): Promise<ScrapeResult> {
  const startedAt = new Date();
  const start = Date.now();
  let raw: RawItem[] = [];
  let status: ScrapeResult["status"] = "ok";
  let error: string | undefined;

  try {
    raw = await runSource(name);
    if (raw.length === 0) status = "empty";
  } catch (e) {
    status = "error";
    error = (e as Error).message;
  }

  // De-dup raw items by externalId within this run.
  const uniq = new Map<string, RawItem>();
  for (const r of raw) if (r.externalId) uniq.set(r.externalId, r);
  const items = [...uniq.values()];

  let accepted = 0;
  let rejected = 0;

  if (items.length > 0) {
    // Classify via LLM (false-positive gate).
    const classifications = await classifyBatch(items);

    for (const c of classifications) {
      const rawItem = items.find((i) => i.externalId === c.externalId);
      if (!rawItem) continue;

      // Skip if already present (dedup across runs).
      const existing = await db.threat.findUnique({ where: { externalId: c.externalId } });
      if (existing) continue;

      const isAccepted =
        c.isAutomotive && c.relevanceScore >= RELEVANCE_THRESHOLD;

      if (isAccepted) accepted++;
      else rejected++;

      await db.threat.create({
        data: {
          externalId: c.externalId,
          title: c.title,
          description: c.description,
          sourceName: rawItem.sourceName,
          sourceType: rawItem.sourceType,
          sourceUrl: rawItem.sourceUrl ?? null,
          victimOrg: c.victimOrg ?? rawItem.victimOrg ?? null,
          victimSector: rawItem.victimSector ?? null,
          country: c.country ?? rawItem.country ?? null,
          attackDate: rawItem.attackDate ? new Date(rawItem.attackDate) : null,
          severity: c.severity,
          isAutomotive: c.isAutomotive,
          relevanceScore: c.relevanceScore,
          automotiveCategory: c.automotiveCategory ?? null,
          atmTactic: c.atmTactic ?? null,
          atmTechnique: c.atmTechnique ?? null,
          classificationReason: c.classificationReason,
          actor: c.actor ?? rawItem.actor ?? null,
          dataTypes: c.dataTypes ?? rawItem.dataTypes ?? null,
          verified: rawItem.sourceType === "darkforum-intel" ? false : isAccepted,
          rawJson: rawItem.rawJson ?? null,
        },
      });
    }
  }

  const finishedAt = new Date();
  await db.scrapeLog.create({
    data: {
      sourceName: name,
      startedAt,
      finishedAt,
      status,
      fetched: items.length,
      accepted,
      rejected,
      error: error ?? null,
    },
  });

  await db.source.update({
    where: { name },
    data: {
      lastFetchAt: finishedAt,
      lastStatus: status,
      lastError: error ?? null,
      threatCount: await db.threat.count({
        where: { sourceName: name, isAutomotive: true, relevanceScore: { gte: RELEVANCE_THRESHOLD } },
      }),
    },
  });

  return {
    source: name,
    status,
    fetched: items.length,
    accepted,
    rejected,
    error,
    durationMs: Date.now() - start,
  };
}

export async function scrapeAll(): Promise<ScrapeResult[]> {
  await ensureSourcesSeeded();
  const sources = await db.source.findMany({ where: { enabled: true } });
  // Run dark-web sources first (most relevant), then OSINT/security sources.
  const ordered = [...sources].sort((a, b) => Number(b.isDarkWeb) - Number(a.isDarkWeb));
  const results: ScrapeResult[] = [];
  for (const s of ordered) {
    try {
      results.push(await scrapeSource(s.name));
    } catch (e) {
      results.push({
        source: s.name,
        status: "error",
        fetched: 0,
        accepted: 0,
        rejected: 0,
        error: (e as Error).message,
        durationMs: 0,
      });
    }
  }
  return results;
}

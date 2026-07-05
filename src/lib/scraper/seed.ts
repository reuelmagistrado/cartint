// Realistic automotive threat-intelligence seed data.
// Models known incident patterns (ransomware on Tier-1 suppliers, CAN-bus /
// infotainment vulns, EV charging issues, telematics leaks, dark-web data
// sales) so the dashboard is populated before the first live scrape.
import { db } from "@/lib/db";

type SeedThreat = {
  externalId: string;
  title: string;
  description: string;
  sourceName: string;
  sourceType: string;
  sourceUrl?: string;
  victimOrg?: string;
  victimSector?: string;
  country?: string;
  attackDate: Date;
  severity: "critical" | "high" | "medium" | "low";
  isAutomotive: boolean;
  relevanceScore: number;
  automotiveCategory?: string;
  atmTactic?: string;
  atmTechnique?: string;
  classificationReason: string;
  actor?: string;
  dataTypes?: string;
  verified: boolean;
};

const now = Date.now();
const days = (n: number) => new Date(now - n * 86400000);

const SEED: SeedThreat[] = [
  // --- Ransomware on Tier-1 suppliers (OEM production impact) ---

  // --- Dark-web forum / marketplace monitoring ---

  // --- Dark-web search (Ahmia) ---

  // --- Security RSS (dark-web breach reporting) ---
  {
    externalId: "seed:news-oem-1",
    title: "OEM confirms breach after dark-web leak site claims theft of OTA keys",
    description: "An automaker confirmed a breach after a ransomware leak site published samples of OTA firmware signing keys and engineering documents.",
    sourceName: "bleepingcomputer",
    sourceType: "security-rss",
    sourceUrl: "https://www.bleepingcomputer.com",
    victimOrg: "OEM (Asia)",
    country: "Japan",
    attackDate: days(8),
    severity: "critical",
    isAutomotive: true,
    relevanceScore: 91,
    automotiveCategory: "OEM",
    atmTactic: "Initial Access",
    atmTechnique: "Supply Chain Compromise",
    classificationReason: "OEM confirms breach with OTA key theft — direct automotive impact.",
    actor: "Cl0p",
    dataTypes: "OTA keys, engineering docs",
    verified: true,
  },
  {
    externalId: "seed:news-mobility-1",
    title: "Mobility platform driver KYC documents surface on dark-web forum",
    description: "A ride-hailing & mobility platform disclosed that ~90k driver KYC documents appeared on a Tor forum following a third-party breach.",
    sourceName: "thehackernews",
    sourceType: "security-rss",
    sourceUrl: "https://thehackernews.com",
    victimOrg: "Mobility platform",
    country: "India",
    attackDate: days(21),
    severity: "high",
    isAutomotive: true,
    relevanceScore: 80,
    automotiveCategory: "Mobility",
    atmTactic: "Exfiltration",
    atmTechnique: "Exfiltration to Cloud Storage",
    classificationReason: "Mobility/ride-hailing platform driver KYC leak on dark web.",
    actor: "MobiLoot",
    dataTypes: "Driver KYC, bank details",
    verified: true,
  },
  {
    externalId: "seed:news-logistics-1",
    title: "Freight fleet telematics provider hit by ransomware",
    description: "A commercial-vehicle fleet telematics provider was hit by ransomware; tracking & route data for thousands of trucks were inaccessible for 48h.",
    sourceName: "bleepingcomputer",
    sourceType: "security-rss",
    sourceUrl: "https://www.bleepingcomputer.com",
    victimOrg: "Freight telematics provider",
    country: "United States",
    attackDate: days(13),
    severity: "high",
    isAutomotive: true,
    relevanceScore: 85,
    automotiveCategory: "Logistics",
    atmTactic: "Impact",
    atmTechnique: "Service Stop",
    classificationReason: "Freight fleet telematics provider ransomware — fleet/logistics impact.",
    actor: "Play",
    dataTypes: "Telematics, route data",
    verified: true,
  },

  // --- False-positive examples (rejected by classifier, kept for audit) ---
  {
    externalId: "seed:fp-university-1",
    title: "University research database leaked on forum",
    description: "A university research database was leaked; the word 'car' appeared incidentally in a dataset name only.",
    sourceName: "thehackernews",
    sourceType: "security-rss",
    victimOrg: "State University",
    country: "United Kingdom",
    attackDate: days(18),
    severity: "low",
    isAutomotive: false,
    relevanceScore: 15,
    classificationReason: "University — incidental 'car' keyword, no automotive relevance (false positive, rejected).",
    actor: "BianLian",
    verified: false,
  },
];

export async function seedIfEmpty() {
  const count = await db.threat.count();
  if (count > 0) return false;

  for (const t of SEED) {
    await db.threat.create({
      data: {
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        sourceName: t.sourceName,
        sourceType: t.sourceType,
        sourceUrl: t.sourceUrl ?? null,
        victimOrg: t.victimOrg ?? null,
        victimSector: t.victimSector ?? null,
        country: t.country ?? null,
        attackDate: t.attackDate,
        severity: t.severity,
        isAutomotive: t.isAutomotive,
        relevanceScore: t.relevanceScore,
        automotiveCategory: t.automotiveCategory ?? null,
        atmTactic: t.atmTactic ?? null,
        atmTechnique: t.atmTechnique ?? null,
        classificationReason: t.classificationReason,
        actor: t.actor ?? null,
        dataTypes: t.dataTypes ?? null,
        verified: t.verified,
        rawJson: null,
      },
    });
  }

  // Update source threat counts & a synthetic scrape log for the seed run.
  const sources = await db.source.findMany();
  if (sources.length === 0) {
    // Ensure source rows exist (in case ensureSourcesSeeded hasn't run).
    const { SOURCE_DEFS } = await import("./sources");
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

  const ts = new Date();
  for (const s of await db.source.findMany()) {
    const accepted = await db.threat.count({
      where: { sourceName: s.name, isAutomotive: true, relevanceScore: { gte: 70 } },
    });
    const rejected = await db.threat.count({
      where: {
        sourceName: s.name,
        OR: [{ isAutomotive: false }, { relevanceScore: { lt: 70 } }],
      },
    });
    await db.source.update({
      where: { name: s.name },
      data: { lastFetchAt: ts, lastStatus: "ok", threatCount: accepted },
    });
    await db.scrapeLog.create({
      data: {
        sourceName: s.name,
        startedAt: ts,
        finishedAt: ts,
        status: "ok",
        fetched: accepted + rejected,
        accepted,
        rejected,
        error: null,
      },
    });
  }

  return true;
}

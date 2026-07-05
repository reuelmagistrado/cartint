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
  {
    externalId: "seed:tier1-ransom-1",
    title: "Major Tier-1 ECU supplier hit by ransomware, OEM production paused",
    description: "A Tier-1 electronic control unit supplier suffered a ransomware attack that encrypted OT networks and forced a multi-day production stoppage affecting several OEM assembly plants.",
    sourceName: "ransomware.live",
    sourceType: "ransomware-api",
    sourceUrl: "https://www.ransomware.live",
    victimOrg: "Tier-1 ECU supplier (Europe)",
    victimSector: "Automotive parts",
    country: "Germany",
    attackDate: days(4),
    severity: "critical",
    isAutomotive: true,
    relevanceScore: 96,
    automotiveCategory: "Tier-1 Supplier",
    atmTactic: "Impact",
    atmTechnique: "Data Encrypted for Impact",
    classificationReason: "Tier-1 ECU supplier with confirmed OT production stoppage affecting OEMs.",
    actor: "BlackBasta",
    dataTypes: "OT systems, engineering data",
    verified: true,
  },
  {
    externalId: "seed:semicon-supplier-1",
    title: "Automotive semiconductor supplier breached, firmware schematics exfiltrated",
    description: "Ransomware actor claims theft of automotive-grade semiconductor design files from a chip supplier serving multiple OEMs.",
    sourceName: "ransomware.live",
    sourceType: "ransomware-api",
    victimOrg: "Auto semiconductor supplier",
    victimSector: "Semiconductors",
    country: "Taiwan",
    attackDate: days(11),
    severity: "high",
    isAutomotive: true,
    relevanceScore: 88,
    automotiveCategory: "Tier-2 Supplier",
    atmTactic: "Exfiltration",
    atmTechnique: "Exfiltration to Cloud Storage",
    classificationReason: "Automotive-grade chip supplier with confirmed exfiltration of design IP.",
    actor: "LockBit",
    dataTypes: "Firmware schematics, design IP",
    verified: true,
  },
  {
    externalId: "seed:dealership-ransom-1",
    title: "Dealership group DMS compromised — finance & customer PII exfiltrated",
    description: "A 40-location dealership group's dealer management system was breached; ransomware actor exfiltrated customer finance applications and PII.",
    sourceName: "ransomware.live",
    sourceType: "ransomware-api",
    victimOrg: "Dealership group (NA)",
    victimSector: "Automotive retail",
    country: "United States",
    attackDate: days(16),
    severity: "high",
    isAutomotive: true,
    relevanceScore: 84,
    automotiveCategory: "Dealership",
    atmTactic: "Exfiltration",
    atmTechnique: "Exfiltration to Cloud Storage",
    classificationReason: "Dealership group DMS breach with customer finance & PII exfiltration.",
    actor: "Akira",
    dataTypes: "Customer PII, finance records",
    verified: true,
  },

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
    externalId: "seed:fp-hospital-1",
    title: "Regional hospital network ransomware attack",
    description: "Ransomware group claims attack on a regional hospital network. No automotive connection.",
    sourceName: "ransomware.live",
    sourceType: "ransomware-api",
    victimOrg: "Regional hospital network",
    country: "United States",
    attackDate: days(6),
    severity: "low",
    isAutomotive: false,
    relevanceScore: 12,
    classificationReason: "Hospital sector — no automotive relevance (false positive, rejected).",
    actor: "BlackCat",
    verified: false,
  },
  {
    externalId: "seed:fp-muni-1",
    title: "Municipality IT systems encrypted by ransomware",
    description: "A municipality's IT systems were encrypted; no automotive or connected-vehicle assets involved.",
    sourceName: "ransomware.live",
    sourceType: "ransomware-api",
    victimOrg: "City of Springfield",
    country: "United States",
    attackDate: days(10),
    severity: "low",
    isAutomotive: false,
    relevanceScore: 8,
    classificationReason: "Municipality — no automotive relevance (false positive, rejected).",
    actor: "Rhysida",
    verified: false,
  },
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

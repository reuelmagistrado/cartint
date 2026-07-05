// Shared types & helpers for the CARTINT dashboard.

export type Severity = "critical" | "high" | "medium" | "low";

export type Threat = {
  id: string;
  externalId: string;
  title: string;
  description: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string | null;
  victimOrg: string | null;
  victimSector: string | null;
  country: string | null;
  attackDate: string | null;
  discoveredAt: string;
  severity: Severity;
  isAutomotive: boolean;
  relevanceScore: number;
  automotiveCategory: string | null;
  atmTactic: string | null;
  atmTechnique: string | null;
  classificationReason: string;
  actor: string | null;
  dataTypes: string | null;
  verified: boolean;
};

export type Stats = {
  totalThreats: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  rejectedCount: number;
  sourcesCount: number;
  darkWebSourcesCount: number;
  verifiedCount: number;
  falsePositiveRate: number;
  totalScraped: number;
  totalRejected: number;
  bySource: { name: string; count: number }[];
  byCategory: { name: string; count: number }[];
  byTactic: { name: string; count: number }[];
  byCountry: { name: string; count: number }[];
  byActor: { name: string; count: number }[];
  trend: { date: string; critical: number; high: number; medium: number; low: number }[];
  recentScrapes: {
    sourceName: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    fetched: number;
    accepted: number;
    rejected: number;
    error: string | null;
  }[];
};

export type SourceInfo = {
  id: string;
  name: string;
  type: string;
  url: string;
  description: string;
  enabled: boolean;
  isDarkWeb: boolean;
  lastFetchAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  threatCount: number;
  lastRun: {
    sourceName: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    fetched: number;
    accepted: number;
    rejected: number;
    error: string | null;
  } | null;
};

export type AtmTacticData = {
  id: string;
  name: string;
  description: string;
  count: number;
  techniques: { id: string; name: string; description: string; count: number }[];
};

export type Report = {
  id: string;
  title: string;
  summary: string;
  period: string;
  threatIds: string;
  generatedAt: string;
  content: string;
};

// Related threat (lighter shape returned by /api/threats/[id]/related).
export type RelatedThreat = {
  id: string;
  title: string;
  severity: Severity;
  sourceName: string;
  automotiveCategory: string | null;
  atmTactic: string | null;
  actor: string | null;
  country: string | null;
  attackDate: string | null;
  relevanceScore: number;
  matchScore: number;
  reasons: string[];
};

// IOCs returned by /api/threats/[id]/iocs.
export type IOCsResult = {
  cves: string[];
  actors: string[];
  dataTypes: string[];
  components: string[];
  countries: string[];
  misc: string[];
  method: "llm" | "regex-fallback" | "none";
};

export const SEVERITY_META: Record<
  Severity,
  { label: string; text: string; bg: string; border: string; dot: string; hex: string }
> = {
  critical: {
    label: "Critical",
    text: "text-rose-300",
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
  high: {
    label: "High",
    text: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
  medium: {
    label: "Medium",
    text: "text-yellow-200",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
    hex: "#facc15",
  },
  low: {
    label: "Low",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
};

export function sourceTypeMeta(type: string): { label: string; tone: string } {
  switch (type) {
    case "ransomware-api":
      return { label: "Ransomware Leak Sites", tone: "text-rose-300 bg-rose-500/10 border-rose-500/30" };
    case "darkweb-search":
      return { label: "Dark-Web Search (Tor)", tone: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30" };
    case "darkforum-intel":
      return { label: "Dark-Web Forum Intel", tone: "text-violet-300 bg-violet-500/10 border-violet-500/30" };
    case "darkweb-scraper":
      return { label: "Dark-Web Scraper (Tor)", tone: "text-rose-300 bg-rose-500/10 border-rose-500/30" };
    case "security-rss":
      return { label: "Security News (dark-web reporting)", tone: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" };
    case "cve":
      return { label: "Vulnerability (ASRG)", tone: "text-teal-300 bg-teal-500/10 border-teal-500/30" };
    default:
      return { label: type, tone: "text-slate-300 bg-slate-500/10 border-slate-500/30" };
  }
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

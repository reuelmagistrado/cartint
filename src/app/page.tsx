"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  RefreshCw,
  Radar,
  Activity,
  Skull,
  Globe,
  Github,
  ExternalLink,
  Loader2,
  Filter,
  Sparkles,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "@/hooks/use-keyboard-shortcuts";
import { useWatchlist } from "@/hooks/use-watchlist";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useThreatStream, type ThreatStreamEvent } from "@/hooks/use-threat-stream";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { BreakdownCharts } from "@/components/dashboard/breakdown-charts";
import { SourcesPanel } from "@/components/dashboard/sources-panel";
import { AtmMatrix } from "@/components/dashboard/atm-matrix";
import { ThreatFeed, ThreatDetailDialog } from "@/components/dashboard/threat-feed";
import { AuditPanel } from "@/components/dashboard/audit-panel";
import { ReportGenerator } from "@/components/dashboard/report-generator";
import { GeoDistribution } from "@/components/dashboard/geo-distribution";
import { ActorSpotlight } from "@/components/dashboard/actor-spotlight";
import { ScrapeHistoryChart } from "@/components/dashboard/scrape-history-chart";
import type { Stats, SourceInfo, AtmTacticData, Threat, Report } from "@/components/dashboard/types";

const PAGE_SIZE = 12;

export default function Home() {
  const { toast } = useToast();

  const [stats, setStats] = useState<Stats | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [atm, setAtm] = useState<{ tactics: AtmTacticData[]; maxCount: number }>({ tactics: [], maxCount: 1 });
  const [filters, setFilters] = useState<{ sources: string[]; categories: string[]; tactics: string[]; countries: string[]; actors: string[] }>({ sources: [], categories: [], tactics: [], countries: [], actors: [] });
  const [reports, setReports] = useState<Report[]>([]);

  const [threats, setThreats] = useState<Threat[]>([]);
  const [threatsTotal, setThreatsTotal] = useState(0);
  const [threatsLoading, setThreatsLoading] = useState(true);

  const [selected, setSelected] = useState<Threat | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Feed filter state — persisted to localStorage so preferences survive reloads.
  const [search, setSearch] = usePersistentState("cartint:filter:search", "");
  const [page, setPage] = useState(0);
  const [fSource, setFSource] = usePersistentState("cartint:filter:source", "all");
  const [fSeverity, setFSeverity] = usePersistentState("cartint:filter:severity", "all");
  const [fCategory, setFCategory] = usePersistentState("cartint:filter:category", "all");
  const [fTactic, setFTactic] = usePersistentState("cartint:filter:tactic", "all");
  const [fCountry, setFCountry] = usePersistentState("cartint:filter:country", "all");
  const [includeRejected, setIncludeRejected] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [trendDays, setTrendDays] = usePersistentState("cartint:filter:trendDays", 14);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const watchlist = useWatchlist();
  const stream = useThreatStream();

  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState<boolean | string>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOverview = useCallback(async () => {
    const [s, src, a, f, r] = await Promise.all([
      fetch(`/api/stats?trendDays=${trendDays}`).then((r) => r.json()),
      fetch("/api/sources").then((r) => r.json()),
      fetch("/api/atm").then((r) => r.json()),
      fetch("/api/filters").then((r) => r.json()),
      fetch("/api/reports").then((r) => r.json()),
    ]);
    setStats(s);
    setSources(src.sources);
    setAtm(a);
    setFilters(f);
    setReports(r.reports);
    setLastUpdated(new Date());
    setLoading(false);
  }, [trendDays]);

  const loadThreats = useCallback(async () => {
    setThreatsLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      source: fSource,
      severity: fSeverity,
      category: fCategory,
      tactic: fTactic,
      country: fCountry,
      search,
      includeRejected: includeRejected ? "1" : "0",
    });
    if (watchlistOnly && watchlist.count > 0) {
      params.set("watchlist", [...watchlist.ids].join(","));
    } else if (watchlistOnly) {
      // No watched items — request an impossible id to return an empty list.
      params.set("watchlist", "__none__");
    }
    try {
      const res = await fetch(`/api/threats?${params}`);
      const json = await res.json();
      setThreats(json.items);
      setThreatsTotal(json.total);
    } finally {
      setThreatsLoading(false);
    }
  }, [page, fSource, fSeverity, fCategory, fTactic, fCountry, search, includeRejected, watchlistOnly, watchlist.ids, watchlist.count]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadThreats();
  }, [loadThreats]);

  // Auto-refresh overview every 60s.
  useEffect(() => {
    const t = setInterval(loadOverview, 60000);
    return () => clearInterval(t);
  }, [loadOverview]);

  // Live-stream: when the WebSocket mini-service broadcasts a "threats:new"
  // event (a scrape just completed), show a toast + auto-refresh the feed.
  const lastEventRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stream.lastEvent) return;
    const ev = stream.lastEvent as ThreatStreamEvent;
    // Dedupe by timestamp so the same event doesn't fire twice.
    if (lastEventRef.current === ev.timestamp) return;
    lastEventRef.current = ev.timestamp;
    if (ev.totalAccepted > 0) {
      toast({
        title: `🔴 ${ev.totalAccepted} new automotive threat${ev.totalAccepted > 1 ? "s" : ""}`,
        description: ev.source
          ? `From ${ev.source} · ${ev.totalRejected} false positive${ev.totalRejected === 1 ? "" : "s"} rejected`
          : `Across all sources · ${ev.totalRejected} false positive${ev.totalRejected === 1 ? "" : "s"} rejected`,
      });
      // Auto-refresh the feed + overview to surface the new threats.
      loadOverview();
      loadThreats();
    }
  }, [stream.lastEvent, toast, loadOverview, loadThreats]);

  const onScrape = useCallback(
    async (source?: string) => {
      setScraping(source ?? true);
      toast({
        title: source ? `Scraping ${source}…` : "Scraping all dark-web & OSINT sources…",
        description: source ? undefined : "Running LLM automotive-relevance classification on every item.",
      });
      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(source ? { source } : {}),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Scrape failed");
        const accepted = (json.results as { accepted: number }[]).reduce((s, r) => s + (r.accepted || 0), 0);
        const rejected = (json.results as { rejected: number }[]).reduce((s, r) => s + (r.rejected || 0), 0);
        toast({
          title: "Scrape complete",
          description: `${accepted} automotive threats accepted · ${rejected} false positives rejected`,
        });
        await Promise.all([loadOverview(), loadThreats()]);
      } catch (e) {
        toast({ title: "Scrape failed", description: (e as Error).message, variant: "destructive" });
      } finally {
        setScraping(false);
      }
    },
    [loadOverview, loadThreats, toast],
  );

  const onSelect = (t: Threat) => {
    setSelected(t);
    setDetailOpen(true);
  };

  // Keyboard shortcuts: `/` focus search, `r` refresh, `f` FP audit, `w` watchlist,
  // `Escape` close dialogs / help, `?` toggle shortcuts help.
  useKeyboardShortcuts([
    {
      key: "/",
      description: "Focus threat search",
      handler: () => {
        const el = document.getElementById("threat-search-input") as HTMLInputElement | null;
        el?.focus();
        el?.select();
      },
    },
    {
      key: "r",
      description: "Refresh feed (scrape all sources)",
      handler: () => onScrape(),
    },
    {
      key: "f",
      description: "Toggle false-positive audit mode",
      handler: () => {
        setIncludeRejected((v) => !v);
        setPage(0);
      },
    },
    {
      key: "w",
      description: "Toggle watchlist filter",
      handler: () => {
        setWatchlistOnly((v) => !v);
        setPage(0);
      },
    },
    {
      key: "?",
      description: "Show keyboard shortcuts help",
      handler: () => setShortcutsOpen((v) => !v),
    },
    {
      key: "Escape",
      description: "Close dialog / help",
      allowInInput: true,
      handler: () => {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (detailOpen) setDetailOpen(false);
      },
    },
  ]);

  return (
    <div className="dark flex min-h-screen flex-col bg-[#070b12] text-slate-200">
      {/* Ambient grid backdrop */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(16,185,129,0.08), transparent 40%), radial-gradient(circle at 80% 10%, rgba(217,70,239,0.06), transparent 45%), linear-gradient(to right, rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.04) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 48px 48px, 48px 48px",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070b12]/90 backdrop-blur supports-[backdrop-filter]:bg-[#070b12]/70">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
              <ShieldAlert className="h-5 w-5 text-emerald-400" />
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-50">
                CARTINT
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  v2
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Automotive Threat Intelligence · Dark-Web OSINT · Auto-ISAC ATM
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 sm:flex"
              title={
                stream.state === "connected"
                  ? "Real-time stream connected"
                  : stream.state === "connecting"
                    ? "Connecting to real-time stream…"
                    : "Real-time stream disconnected"
              }
            >
              <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="relative flex h-2 w-2">
                  {stream.state === "connected" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      stream.state === "connected"
                        ? "bg-emerald-500"
                        : stream.state === "connecting"
                          ? "bg-amber-400"
                          : "bg-rose-500"
                    }`}
                  />
                </span>
                {stream.state === "connected" ? "LIVE" : stream.state === "connecting" ? "SYNC" : "OFFLINE"}
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-[11px] text-slate-400">
                {lastUpdated ? `updated ${formatTimeAgo(lastUpdated)}` : "loading…"}
              </span>
            </div>
            <Button
              onClick={() => onScrape()}
              disabled={scraping === true}
              className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              size="sm"
            >
              {scraping === true ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Feed
            </Button>
            <Button
              onClick={() => setShortcutsOpen(true)}
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
              <kbd className="ml-1 hidden rounded border border-slate-600 bg-slate-800 px-1 font-mono text-[9px] text-slate-400 sm:inline">?</kbd>
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 space-y-4 px-4 py-4">
        {/* Hero / mission banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-emerald-950/30 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/15">
                <Skull className="h-4 w-4 text-fuchsia-300" />
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  Multi-source dark-web monitoring — no longer ransomware.live only
                  <span className="hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 sm:inline-flex">
                    <Sparkles className="h-3 w-3" />
                    Powered by LLM classification
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  6 sources · Tor hidden-service search, ransomware leak sites, dark-web forum intel, security RSS, NVD automotive CVEs · LLM-classified for zero false positives
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Stat icon={Radar} label="Sources" value={stats?.sourcesCount ?? 0} tone="text-fuchsia-300" />
              <div className="h-8 w-px bg-slate-700" />
              <Stat icon={Activity} label="LLM-gated" value="100%" tone="text-emerald-300" />
              <div className="h-8 w-px bg-slate-700" />
              <Stat icon={Globe} label="Countries" value={stats?.byCountry.length ?? 0} tone="text-cyan-300" />
            </div>
          </div>
        </motion.div>

        {/* KPI cards */}
        <KpiCards stats={stats} loading={loading} />

        {/* Trend + Sources */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <TrendChart stats={stats} trendDays={trendDays} onTrendDaysChange={setTrendDays} />
          </div>
          <div>
            <SourcesPanel sources={sources} loading={loading} onScrape={onScrape} scraping={scraping} />
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          <FilterSelect label="Source" value={fSource} onChange={(v) => { setFSource(v); setPage(0); }} options={filters.sources} />
          <FilterSelect label="Severity" value={fSeverity} onChange={(v) => { setFSeverity(v); setPage(0); }} options={["critical", "high", "medium", "low"]} />
          <FilterSelect label="Category" value={fCategory} onChange={(v) => { setFCategory(v); setPage(0); }} options={filters.categories} />
          <FilterSelect label="ATM Tactic" value={fTactic} onChange={(v) => { setFTactic(v); setPage(0); }} options={filters.tactics} />
          <FilterSelect label="Country" value={fCountry} onChange={(v) => { setFCountry(v); setPage(0); }} options={filters.countries} />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            onClick={() => {
              setFSource("all");
              setFSeverity("all");
              setFCategory("all");
              setFTactic("all");
              setFCountry("all");
              setSearch("");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        </div>

        {/* Threat feed (full width card) */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <ThreatFeed
            threats={threats}
            total={threatsTotal}
            loading={threatsLoading}
            onSelect={onSelect}
            search={search}
            setSearch={(v) => { setSearch(v); setPage(0); }}
            page={page}
            setPage={setPage}
            pageSize={PAGE_SIZE}
            includeRejected={includeRejected}
            setIncludeRejected={setIncludeRejected}
            watchlistOnly={watchlistOnly}
            setWatchlistOnly={setWatchlistOnly}
            watchlistCount={watchlist.count}
            isWatched={watchlist.has}
            toggleWatch={watchlist.toggle}
            searchInputId="threat-search-input"
          />
        </div>

        {/* ATM matrix full width */}
        <AtmMatrix tactics={atm.tactics} maxCount={atm.maxCount} loading={loading} />

        {/* Breakdown charts */}
        <BreakdownCharts stats={stats} />

        {/* Scrape history + false-positive trend */}
        <ScrapeHistoryChart />

        {/* Geographic distribution + Threat actor spotlight */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GeoDistribution stats={stats} />
          <ActorSpotlight stats={stats} />
        </div>

        {/* Audit + Reports */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AuditPanel stats={stats} />
          <ReportGenerator reports={reports} onRefresh={loadOverview} />
        </div>
      </main>

      {/* Footer (sticky) */}
      <footer className="relative z-10 mt-auto border-t border-slate-800 bg-[#070b12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-emerald-500/70" />
            <span>
              CARTINT v2 — Automotive Threat Intelligence · {stats?.totalThreats ?? 0} active threats ·{" "}
              {stats?.falsePositiveRate ?? 0}% false-positive rejection
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/reuelmagistrado/cartint-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-slate-300"
            >
              <Github className="h-3.5 w-3.5" /> cartint-dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-slate-600">·</span>
            <span>Dark-web OSINT · LLM-classified · Auto-ISAC ATM</span>
          </div>
        </div>
      </footer>

      <ThreatDetailDialog
        threat={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSelectRelated={(t) => {
          setSelected(t);
          // keep dialog open; the related-threats effect re-fetches for the new threat
        }}
      />

      {/* Keyboard shortcuts help */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 p-0">
          <DialogHeader className="border-b border-slate-800 p-5 pb-4">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-50">
              <Keyboard className="h-4 w-4 text-emerald-400" /> Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <ul className="space-y-2">
              {SHORTCUT_HELP.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-300">{s.description}</span>
                  <kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                    {s.key}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-slate-500">
              Shortcuts are disabled while typing in inputs (except <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono">Esc</kbd>).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone}`} />
      <div>
        <p className={`font-mono text-base font-bold leading-none ${tone}`}>{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[140px] border-slate-700 bg-slate-900/60 text-xs text-slate-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-slate-700 bg-slate-950 text-slate-200">
          <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function formatTimeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

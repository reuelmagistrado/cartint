"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Loader2, FileDown, Printer, Settings2,
  Calendar, AlertTriangle, Shield, Globe, Users, Target,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Threat } from "./types";

type ReportType = "weekly-digest" | "threat-actor-profile" | "incident-report" | "campaign-analysis" | "sector-assessment" | "ad-hoc";

const REPORT_TYPES: { value: ReportType; label: string; desc: string; defaultDays: number }[] = [
  { value: "weekly-digest", label: "Weekly Threat Digest", desc: "Automated weekly summary of all automotive threats", defaultDays: 7 },
  { value: "threat-actor-profile", label: "Threat Actor Profile", desc: "Deep-dive on a single threat actor", defaultDays: 30 },
  { value: "incident-report", label: "Incident Report", desc: "Focused report on one specific threat", defaultDays: 30 },
  { value: "campaign-analysis", label: "Campaign Analysis", desc: "Coordinated campaign analysis across multiple threats", defaultDays: 14 },
  { value: "sector-assessment", label: "Sector Threat Assessment", desc: "Threats targeting a specific automotive sector", defaultDays: 30 },
  { value: "ad-hoc", label: "Ad-Hoc Report", desc: "Analyst-defined report with manual threat selection", defaultDays: 30 },
];

const ALL_SECTIONS = [
  "Threat Overview", "Adversary Interest Analysis", "Intelligence Levels",
  "Diamond Model", "Cyber Kill Chain", "ATM Mapping", "Collection Methodology",
  "Artifacts", "Risk Assessment", "Source Reliability", "Recommendations",
  "Distribution", "Glossary",
];

type GeneratedReport = {
  id: string;
  title: string;
  type: ReportType;
  content: string;
  summary: string;
  period: string;
  metadata: {
    priority: string;
    tlp: string;
    companyName: string;
    reportId: string;
    date: string;
    reliability: string;
  };
  threatIds: string[];
  generatedAt: string;
  method: string;
};

export function CtiReportsTab({ threats, actors, categories, countries }: {
  threats: Threat[];
  actors: string[];
  categories: string[];
  countries: string[];
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [streamProgress, setStreamProgress] = useState("");

  // Form state
  const [reportType, setReportType] = useState<ReportType>("weekly-digest");
  const [timeRange, setTimeRange] = useState(7);
  const [threatActor, setThreatActor] = useState("all");
  const [sector, setSector] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState<"actor" | "sector" | "country">("actor");
  const [campaignValue, setCampaignValue] = useState("all");
  const [priority, setPriority] = useState("High");
  const [tlp, setTlp] = useState("TLP:AMBER");
  const [companyName, setCompanyName] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>(ALL_SECTIONS);
  const [selectedThreatIds, setSelectedThreatIds] = useState<string[]>([]);
  const [singleThreatId, setSingleThreatId] = useState("all");

  const currentReportType = REPORT_TYPES.find((r) => r.value === reportType);

  const toggleSection = (section: string) => {
    setSelectedThreatIds((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  };

  const toggleThreatSelection = (id: string) => {
    setSelectedThreatIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const generate = async () => {
    setGenerating(true);
    setReport(null);
    setStreamProgress("");
    toast({ title: "Generating CTI Report…", description: "The LLM is analyzing all threats in the selected time range. This takes 30-90s — the report will appear when complete." });
    try {
      const config: Record<string, unknown> = {
        type: reportType,
        timeRangeDays: timeRange,
        priority: priority.toLowerCase(),
        tlp,
        companyName,
        sections: selectedSections,
      };

      if (reportType === "threat-actor-profile" && threatActor !== "all") config.threatActor = threatActor;
      if (reportType === "sector-assessment" && sector !== "all") config.sector = sector;
      if (reportType === "incident-report" && singleThreatId !== "all") config.singleThreatId = singleThreatId;
      if (reportType === "campaign-analysis") {
        config.campaignFilter = campaignFilter;
        config.campaignFilterValue = campaignValue !== "all" ? campaignValue : undefined;
      }
      if (reportType === "ad-hoc" && selectedThreatIds.length > 0) config.threatIds = selectedThreatIds;

      // Step 1: Start the generation job (returns immediately with a jobId)
      const startRes = await fetch("/api/cti-reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(15000),
      });

      if (!startRes.ok) {
        const text = await startRes.text().catch(() => "");
        throw new Error(text || `Server returned ${startRes.status}`);
      }

      const startJson = await startRes.json();
      if (!startJson.ok || !startJson.jobId) {
        throw new Error(startJson.error || "Failed to start report generation");
      }

      const jobId = startJson.jobId;

      // Step 2: Poll for completion. Each poll is a fast GET (<100ms), so no
      // gateway timeout. Poll every 2s for up to 5 minutes.
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLL_MS = 300_000; // 5 min
      const startTime = Date.now();
      let lastProgressLen = 0;

      while (true) {
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_POLL_MS) {
          throw new Error("Report generation timed out after 5 minutes. The LLM may be overloaded — please try again.");
        }

        // Wait before polling
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const pollRes = await fetch(`/api/cti-reports/generate?jobId=${encodeURIComponent(jobId)}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!pollRes.ok) {
          // 404 = job expired; continue polling a few times in case of transient error
          if (pollRes.status === 404) {
            throw new Error("Report job not found — it may have expired. Please try again.");
          }
          continue; // transient error, keep polling
        }

        const pollJson = await pollRes.json();

        // Show progress preview if available
        if (pollJson.progress && pollJson.progress.length > lastProgressLen) {
          lastProgressLen = pollJson.progress.length;
          setStreamProgress(pollJson.progress);
        }

        if (pollJson.status === "complete") {
          // Step 3: Fetch the full report
          setStreamProgress("");
          const resultRes = await fetch(`/api/cti-reports/result?jobId=${encodeURIComponent(jobId)}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!resultRes.ok) {
            throw new Error("Failed to fetch completed report");
          }
          const resultJson = await resultRes.json();
          if (!resultJson.ok || !resultJson.report) {
            throw new Error("Completed report was empty");
          }
          const report = resultJson.report as GeneratedReport;
          setReport(report);
          const methodNote = report.method === "template" ? " (template fallback)" : "";
          toast({ title: "CTI Report generated", description: report.title + methodNote });
          break;
        }

        if (pollJson.status === "error") {
          throw new Error(pollJson.error || "Report generation failed on the server");
        }

        // status === "pending" — keep polling
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("abort") || msg.includes("timed out") || msg.includes("Timeout") || msg.includes("timed out after")) {
        toast({ title: "Report generation timed out", description: "The request took too long. Please try again.", variant: "destructive" });
      } else if (msg.includes("network") || msg.includes("Network") || msg.includes("fetch")) {
        toast({ title: "Network error", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Report generation failed", description: msg, variant: "destructive" });
      }
    } finally {
      setGenerating(false);
      setStreamProgress("");
    }
  };

  const exportMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!report) return;
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    w.document.open();
    w.document.write(`<html><head><title>${report.title}</title>
<style>
@page { margin: 18mm 16mm; }
body { font-family: -apple-system, sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 32px; line-height: 1.55; font-size: 13px; }
.header { border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px; }
.brand { font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase; }
h1 { font-size: 20px; margin: 4px 0 6px; }
.meta { font-size: 11px; color: #64748b; }
h2 { color: #064e3b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-top: 22px; }
h3 { font-size: 13px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 8px 0; }
th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
th { background: #f1f5f9; }
strong { color: #0f172a; }
.footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
</style></head><body>
<div class="header"><div class="brand">CARTINT — Automotive Threat Intelligence</div>
<h1>${report.title}</h1>
<div class="meta">Report ID: ${report.metadata.reportId} · ${report.metadata.date} · ${report.metadata.tlp} · Priority: ${report.metadata.priority}</div>
</div>
${renderMarkdownToHtml(report.content)}
<div class="footer">CARTINT — Dark-web OSINT · LLM-classified · Auto-ISAC ATM · Generated: ${report.generatedAt} · Method: ${report.method}</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="border-slate-700/60 bg-slate-900/40 p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-slate-100">Generate CTI Report</h2>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Left column: report type + time range */}
                <div className="space-y-4">
                  {/* Report Type */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Report Type</label>
                    <div className="space-y-1.5">
                      {REPORT_TYPES.map((rt) => (
                        <button
                          key={rt.value}
                          onClick={() => { setReportType(rt.value); setTimeRange(rt.defaultDays); }}
                          className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                            reportType === rt.value
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                          }`}
                        >
                          <div className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 ${reportType === rt.value ? "border-emerald-500 bg-emerald-500" : "border-slate-600"}`} />
                          <div>
                            <p className={`text-xs font-medium ${reportType === rt.value ? "text-emerald-200" : "text-slate-200"}`}>{rt.label}</p>
                            <p className="text-[10px] text-slate-500">{rt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Range */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <Calendar className="mr-1 inline h-3 w-3" /> Time Range
                    </label>
                    <div className="flex gap-2">
                      {[7, 14, 30].map((d) => (
                        <button
                          key={d}
                          onClick={() => setTimeRange(d)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            timeRange === d
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                              : "border-slate-700 text-slate-400 hover:bg-slate-800"
                          }`}
                        >
                          {d} days
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right column: conditional fields */}
                <div className="space-y-4">
                  {/* Threat Actor Profile — actor selector */}
                  {reportType === "threat-actor-profile" && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <Users className="mr-1 inline h-3 w-3" /> Threat Actor
                      </label>
                      <Select value={threatActor} onValueChange={setThreatActor}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-950">
                          <SelectItem value="all">All actors</SelectItem>
                          {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Sector Assessment — sector selector */}
                  {reportType === "sector-assessment" && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <Target className="mr-1 inline h-3 w-3" /> Sector
                      </label>
                      <Select value={sector} onValueChange={setSector}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-950">
                          <SelectItem value="all">All sectors</SelectItem>
                          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Incident Report — single threat selector */}
                  {reportType === "incident-report" && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <AlertTriangle className="mr-1 inline h-3 w-3" /> Select Threat
                      </label>
                      <Select value={singleThreatId} onValueChange={setSingleThreatId}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px] border-slate-700 bg-slate-950">
                          <SelectItem value="all">Auto-select most recent</SelectItem>
                          {threats.slice(0, 30).map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.title.slice(0, 50)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Campaign Analysis — filter type + value */}
                  {reportType === "campaign-analysis" && (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Campaign Filter</label>
                      <div className="flex gap-2">
                        {(["actor", "sector", "country"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setCampaignFilter(f)}
                            className={`rounded border px-2 py-1 text-[10px] capitalize ${campaignFilter === f ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400"}`}
                          >
                            By {f}
                          </button>
                        ))}
                      </div>
                      <Select value={campaignValue} onValueChange={setCampaignValue}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-950">
                          <SelectItem value="all">All</SelectItem>
                          {(campaignFilter === "actor" ? actors : campaignFilter === "sector" ? categories : countries).map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Ad-Hoc — threat multi-select */}
                  {reportType === "ad-hoc" && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Select Threats ({selectedThreatIds.length} selected)
                      </label>
                      <ScrollArea className="h-[150px] rounded border border-slate-700 bg-slate-900/40">
                        <div className="p-2 space-y-1">
                          {threats.slice(0, 50).map((t) => (
                            <label key={t.id} className="flex items-center gap-2 rounded p-1 hover:bg-slate-800/40 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedThreatIds.includes(t.id)}
                                onChange={() => toggleThreatSelection(t.id)}
                                className="h-3 w-3 accent-emerald-500"
                              />
                              <span className="truncate text-[10px] text-slate-300">{t.title.slice(0, 50)}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Priority + TLP + Company */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Priority</label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-950">
                          <SelectItem value="Critical">Critical</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">TLP</label>
                      <Select value={tlp} onValueChange={setTlp}>
                        <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-950">
                          <SelectItem value="TLP:WHITE">TLP:WHITE</SelectItem>
                          <SelectItem value="TLP:GREEN">TLP:GREEN</SelectItem>
                          <SelectItem value="TLP:AMBER">TLP:AMBER</SelectItem>
                          <SelectItem value="TLP:RED">TLP:RED</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Company Name</label>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="[Organization Name Withheld]"
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900/60 px-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div className="mt-4">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Include Sections</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SECTIONS.map((s) => {
                    const isOn = selectedSections.includes(s);
                    const toggle = () => setSelectedSections((prev) => isOn ? prev.filter((x) => x !== s) : [...prev, s]);
                    return (
                      <button
                        key={s}
                        onClick={toggle}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                          isOn ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-500"
                        }`}
                      >
                        {isOn ? "✓ " : ""}{s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 flex justify-end gap-2">
                <div className="flex items-center gap-3">
                  {generating && streamProgress && (
                    <span className="text-[10px] text-emerald-400/70">
                      {streamProgress.length > 100 ? `${streamProgress.slice(0, 100)}…` : streamProgress.replace(/[#*|]/g, "").trim() || "streaming…"}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={generate}
                    disabled={generating}
                    className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {generating ? (streamProgress ? "Streaming…" : "Starting…") : "Generate Report"}
                  </Button>
                </div>
              </div>
            </Card>
      </motion.div>

      {/* Report viewer modal — overlays the footer (z-50) instead of
          competing with it inline. The form stays available underneath so
          the analyst can tweak settings and regenerate immediately. */}
      <Dialog open={!!report} onOpenChange={(v) => !v && setReport(null)}>
        <DialogContent className="flex max-h-[90vh] min-h-0 flex-col overflow-hidden border-slate-700 bg-slate-950 p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 space-y-0 border-b border-slate-800 p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm font-semibold leading-tight text-slate-50">
                  {report?.title}
                </DialogTitle>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <Badge variant="outline" className={`h-4 border px-1 text-[9px] ${report?.method === "llm" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                    {report?.method === "llm" ? "LLM" : "Template"}
                  </Badge>
                  <span><strong className="text-slate-300">ID:</strong> {report?.metadata.reportId}</span>
                  <span><strong className="text-slate-300">Date:</strong> {report?.metadata.date}</span>
                  <span><strong className="text-slate-300">Priority:</strong> {report?.metadata.priority}</span>
                  <span><strong className="text-slate-300">TLP:</strong> {report?.metadata.tlp}</span>
                  <span><strong className="text-slate-300">Reliability:</strong> {report?.metadata.reliability}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={printReport} disabled={!report}>
                  <Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">PDF</span>
                </Button>
                <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={exportMarkdown} disabled={!report}>
                  <FileDown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">.md</span>
                </Button>
                <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={exportJson} disabled={!report}>
                  <FileDown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">.json</span>
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="mt-5 mb-3 text-lg font-bold text-emerald-200">{children}</h1>,
                  h2: ({ children }) => <h2 className="mt-5 mb-2 text-sm font-bold text-emerald-200 border-b border-slate-800 pb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-slate-100">{children}</h3>,
                  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[12px] font-semibold text-slate-200">{children}</h4>,
                  p: ({ children }) => <p className="my-2 text-[13px] leading-relaxed text-slate-300">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                  em: ({ children }) => <em className="italic text-slate-400">{children}</em>,
                  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-[13px] text-slate-300">{children}</li>,
                  hr: () => <hr className="my-4 border-slate-800" />,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">{children}</a>,
                  table: ({ children }) => <table className="my-3 w-full border-collapse text-xs">{children}</table>,
                  thead: ({ children }) => <thead className="bg-slate-800/40">{children}</thead>,
                  th: ({ children }) => <th className="border border-slate-700 px-2 py-1 text-left font-semibold text-slate-200">{children}</th>,
                  td: ({ children }) => <td className="border border-slate-800 px-2 py-1 text-slate-400">{children}</td>,
                  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-emerald-500/40 pl-3 italic text-slate-400">{children}</blockquote>,
                  code: ({ children }) => <code className="rounded bg-slate-800/60 px-1 py-0.5 font-mono text-[11px] text-emerald-300">{children}</code>,
                  pre: ({ children }) => <pre className="my-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 overflow-x-auto">{children}</pre>,
                }}
              >
                {stripCodeFences(report?.content ?? "")}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Strip ```markdown ... ``` code fences that the LLM may wrap around the output
function stripCodeFences(content: string): string {
  let cleaned = content.trim();
  // Remove leading ```markdown or ```md or ```
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n/i, "");
  // Remove trailing ```
  cleaned = cleaned.replace(/\n```\s*$/i, "");
  return cleaned.trim();
}

function renderMarkdownToHtml(content: string): string {
  // Simple markdown-to-HTML for the print window (no react-markdown available there)
  const cleaned = stripCodeFences(content);
  let html = cleaned
    .replace(/^#### (.+)/gm, "<h4>$1</h4>")
    .replace(/^### (.+)/gm, "<h3>$1</h3>")
    .replace(/^## (.+)/gm, "<h2>$1</h2>")
    .replace(/^# (.+)/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^---$/gm, "<hr>")
    .replace(/^\s*[-*]\s(.+)/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?=\n\n|\n##|\n#|\Z)/g, "<ul>$1</ul>");

  // Convert tables
  const tableLines = cleaned.split("\n").filter((l) => l.startsWith("| "));
  if (tableLines.length > 0) {
    html = html.replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split("|").filter((c) => c.trim());
      const tds = cells.map((c) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    });
    html = html.replace(/(<tr>[\s\S]*?<\/tr>)(?=\n\n|\n##|\n#|\Z)/g, "<table>$1</table>");
  }

  return html;
}

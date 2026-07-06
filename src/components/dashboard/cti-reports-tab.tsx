"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Loader2, FileDown, Printer, ChevronLeft, Settings2,
  Calendar, AlertTriangle, Shield, Globe, Users, Target,
} from "lucide-react";
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
  const [showForm, setShowForm] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<GeneratedReport | null>(null);

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

      const res = await fetch("/api/cti-reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Generation failed");

      setReport(json.report);
      setShowForm(false);
      toast({ title: "CTI Report generated", description: json.report.title });
    } catch (e) {
      toast({ title: "Report generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
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
      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                <Button variant="outline" size="sm" className="border-slate-700 text-slate-400" onClick={() => { setShowForm(true); setReport(null); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={generate}
                  disabled={generating}
                  className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {generating ? "Generating…" : "Generate Report"}
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {report && (
              <Card className="border-slate-700/60 bg-slate-900/40">
                {/* Report header */}
                <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-slate-400" onClick={() => { setShowForm(true); setReport(null); }}>
                      <ChevronLeft className="h-4 w-4" /> New Report
                    </Button>
                    <span className="text-xs font-semibold text-slate-100">{report.title}</span>
                    <Badge variant="outline" className={`h-4 border px-1 text-[9px] ${report.method === "llm" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                      {report.method === "llm" ? "LLM" : "Template"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={printReport}>
                      <Printer className="h-3.5 w-3.5" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={exportMarkdown}>
                      <FileDown className="h-3.5 w-3.5" /> .md
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={exportJson}>
                      <FileDown className="h-3.5 w-3.5" /> .json
                    </Button>
                  </div>
                </div>

                {/* Report metadata bar */}
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2 text-[10px] text-slate-500">
                  <span><strong className="text-slate-300">ID:</strong> {report.metadata.reportId}</span>
                  <span><strong className="text-slate-300">Date:</strong> {report.metadata.date}</span>
                  <span><strong className="text-slate-300">Priority:</strong> {report.metadata.priority}</span>
                  <span><strong className="text-slate-300">TLP:</strong> {report.metadata.tlp}</span>
                  <span><strong className="text-slate-300">Reliability:</strong> {report.metadata.reliability}</span>
                </div>

                {/* Report content */}
                <ScrollArea className="max-h-[calc(100vh-220px)]">
                  <article className="prose prose-invert prose-sm max-w-none p-5 prose-headings:text-slate-100 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-headings:font-semibold prose-table:text-xs prose-th:text-slate-300 prose-td:text-slate-400">
                    {renderMarkdown(report.content)}
                  </article>
                </ScrollArea>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simple markdown renderer (headings, tables, lists, bold, paragraphs)
function renderMarkdown(content: string) {
  // Split into blocks: collect consecutive table lines into table blocks
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Table block
    if (line.startsWith("| ")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("| ")) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(renderTable(tableLines, blocks.length));
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const cls = level === 1 ? "mt-4 mb-2 text-base text-emerald-200" : level === 2 ? "mt-4 mb-2 text-sm text-emerald-200 border-b border-slate-800 pb-1" : "mt-3 mb-1 text-[13px] text-slate-200";
      blocks.push(<h4 key={blocks.length} className={cls}>{text}</h4>);
      i++;
      continue;
    }
    if (line.trim() === "") { blocks.push(<div key={blocks.length} className="h-2" />); i++; continue; }
    if (/^\s*[-*]\s/.test(line)) {
      blocks.push(<li key={blocks.length} className="ml-4 text-slate-300">{line.replace(/^\s*[-*]\s/, "").replace(/\*\*(.+?)\*\*/g, "$1")}</li>);
      i++;
      continue;
    }
    if (line.startsWith("---")) { blocks.push(<hr key={blocks.length} className="border-slate-800 my-4" />); i++; continue; }
    const bolded = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    blocks.push(<p key={blocks.length} className="text-slate-300" dangerouslySetInnerHTML={{ __html: bolded }} />);
    i++;
  }
  return blocks;
}

function renderTable(lines: string[], key: number) {
  const rows = lines.map((line) => {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    return cells;
  });
  if (rows.length === 0) return null;
  const isHeaderSep = (row: string[]) => row.every((c) => /^[-:]+$/.test(c));
  const hasHeader = rows.length > 1 && !isHeaderSep(rows[0]) && isHeaderSep(rows[1]);
  const headerRow = hasHeader ? rows[0] : null;
  const bodyRows = hasHeader ? rows.slice(2) : rows.filter((r) => !isHeaderSep(r));
  return (
    <table key={key} className="my-2 w-full border-collapse text-xs">
      {headerRow && (
        <thead>
          <tr>{headerRow.map((c, i) => <th key={i} className="border border-slate-700 bg-slate-800/40 px-2 py-1 text-left text-slate-300">{c}</th>)}</tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {row.map((c, ci) => <td key={ci} className="border border-slate-800 px-2 py-1 text-slate-400">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderMarkdownToHtml(content: string): string {
  // Convert markdown to simple HTML for the print window
  let html = content
    .replace(/^### (.+)/gm, "<h3>$1</h3>")
    .replace(/^## (.+)/gm, "<h2>$1</h2>")
    .replace(/^# (.+)/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^\s*[-*]\s(.+)/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>");

  // Convert tables
  const tableLines = content.split("\n").filter((l) => l.startsWith("| "));
  if (tableLines.length > 0) {
    html = html.replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split("|").filter((c) => c.trim());
      const tds = cells.map((c) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    });
    html = html.replace(/(<tr>[\s\S]*<\/tr>)/, "<table>$1</table>");
  }

  return html;
}

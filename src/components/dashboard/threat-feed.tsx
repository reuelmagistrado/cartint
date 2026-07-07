"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, ShieldX, ShieldCheck, ExternalLink, MapPin, User, Database, ChevronRight, Download, Star, Link2, Loader2, Fingerprint, Copy, Check, Brain, Target, Eye, GitBranch, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Threat, RelatedThreat, IOCsResult, AtmMappingResult } from "./types";
import { SEVERITY_META, sourceTypeMeta, fmtDate } from "./types";

export function ThreatDetailDialog({
  threat,
  open,
  onOpenChange,
  onSelectRelated,
}: {
  threat: Threat | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectRelated?: (t: Threat) => void;
}) {
  const [related, setRelated] = useState<RelatedThreat[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [iocs, setIocs] = useState<IOCsResult | null>(null);
  const [iocsLoading, setIocsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [atmMapping, setAtmMapping] = useState<AtmMappingResult | null>(null);
  const [atmMappingLoading, setAtmMappingLoading] = useState(false);

  useEffect(() => {
    if (!threat || !open) {
      queueMicrotask(() => {
        setRelated([]);
        setIocs(null);
        setAtmMapping(null);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setRelatedLoading(true);
      setIocsLoading(true);
    });
    fetch(`/api/threats/${threat.id}/related`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setRelated(json.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    fetch(`/api/threats/${threat.id}/iocs`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setIocs(json.iocs ?? null);
      })
      .catch(() => {
        if (!cancelled) setIocs(null);
      })
      .finally(() => {
        if (!cancelled) setIocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threat, open]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  const mapToAtm = async () => {
    if (!threat) return;
    setAtmMappingLoading(true);
    try {
      const res = await fetch(`/api/threats/${threat.id}/map-atm`, { method: "POST" });
      const json = await res.json();
      if (json.ok) setAtmMapping(json.mapping);
    } catch {
      // non-fatal
    } finally {
      setAtmMappingLoading(false);
    }
  };

  if (!threat) return null;
  const sev = SEVERITY_META[threat.severity];
  const srcMeta = sourceTypeMeta(threat.sourceType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] min-h-0 flex-col overflow-hidden border-slate-700 bg-slate-950 p-0">
        <DialogHeader className="shrink-0 border-b border-slate-800 p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`h-5 border ${sev.bg} ${sev.border} ${sev.text} text-[10px] font-bold uppercase`}>
                  {sev.label}
                </Badge>
                <Badge variant="outline" className={`h-5 border ${srcMeta.tone} text-[10px]`}>
                  {srcMeta.label}
                </Badge>
                <Badge variant="outline" className="h-5 border border-slate-600 text-[10px] text-slate-300">
                  {threat.automotiveCategory ?? "Uncategorized"}
                </Badge>
                {threat.verified ? (
                  <Badge variant="outline" className="h-5 border border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                    <ShieldX className="mr-1 h-3 w-3" /> Unverified
                  </Badge>
                )}
              </div>
              <DialogTitle className="pr-2 text-base font-semibold leading-snug text-slate-50">
                {threat.title}
              </DialogTitle>
              <DialogDescription className="mt-1 font-mono text-[10px] text-slate-500">
                ID: {threat.externalId}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="min-w-0 space-y-4 p-5">
            <div>
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Description</h4>
              <p className="break-words text-sm leading-relaxed text-slate-200">{threat.description}</p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 text-xs">
              <InfoRow icon={User} label="Threat Actor" value={threat.actor ?? "Unknown"} />
              <InfoRow icon={User} label="Victim Organization" value={threat.victimOrg ?? "Unknown"} />
              <InfoRow icon={MapPin} label="Country" value={threat.country ?? "Unknown"} />
              <InfoRow icon={Database} label="Data Types" value={threat.dataTypes ?? "—"} />
            </div>

            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Automotive Relevance & ATM Mapping
              </h4>
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">AI Confidence Score</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${threat.relevanceScore}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-300">{threat.relevanceScore}/100</span>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2 text-[11px]">
                  <Field label="Category" value={threat.automotiveCategory ?? "—"} />
                  <Field label="ATM Tactic" value={threat.atmTactic ?? "—"} />
                  <Field label="ATM Technique" value={threat.atmTechnique ?? "—"} />
                  <Field label="Attack Date" value={fmtDate(threat.attackDate)} />
                </div>
                <div className="mt-2 rounded bg-slate-800/60 px-2 py-1.5 text-[11px] italic text-slate-300">
                  &ldquo;{threat.classificationReason}&rdquo;
                </div>
              </div>
            </div>

            {/* AI ATM Mapping section */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Brain className="h-3.5 w-3.5 text-cyan-400" /> AI ATM Mapping
                  <span className="text-[9px] font-normal normal-case text-slate-500">Attacker-Intent Analysis</span>
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={mapToAtm}
                  disabled={atmMappingLoading}
                  className="h-6 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                >
                  {atmMappingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                  {atmMapping ? "Re-map" : "Map to ATM"}
                </Button>
              </div>
              {atmMappingLoading ? (
                <div className="flex items-center gap-2 py-4 text-[11px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running 5-step ATM mapping methodology…
                </div>
              ) : atmMapping ? (
                <div className="space-y-3 rounded-lg border border-cyan-500/20 bg-slate-900/50 p-3">
                  {/* Incident context */}
                  <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                    <ContextRow icon={Target} label="Target Asset" value={atmMapping.incidentContext.targetAsset} />
                    <ContextRow icon={Eye} label="Attack Surface" value={atmMapping.incidentContext.attackSurface} />
                    <ContextRow icon={AlertCircle} label="Observed Effect" value={atmMapping.incidentContext.observedEffect} />
                    <ContextRow icon={GitBranch} label="Vehicle Consequence" value={atmMapping.incidentContext.vehicleLevelConsequence} />
                  </div>

                  {/* Attacker intent */}
                  <div className="rounded border border-slate-700/50 bg-slate-800/30 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Attacker Intent Reconstruction</p>
                    <p className="text-[11px] leading-relaxed text-slate-300">{atmMapping.attackerIntent}</p>
                  </div>

                  {/* Mapped tactics + techniques */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Mapped Tactics & Techniques ({atmMapping.tactics.length})
                    </p>
                    <div className="space-y-1.5">
                      {atmMapping.tactics.map((t, ti) => (
                        <div key={ti} className="rounded border border-slate-700/40 bg-slate-800/20 p-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="h-4 border-emerald-500/40 bg-emerald-500/10 px-1 text-[9px] text-emerald-300">
                              {t.evidenceType}
                            </Badge>
                            <span className="text-[11px] font-semibold text-slate-100">{t.name}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">{t.reasoning}</p>
                          {t.techniques.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {t.techniques.map((tech, thi) => (
                                <div key={thi} className="flex items-start gap-1.5 rounded bg-slate-900/40 px-1.5 py-1">
                                  <Badge variant="outline" className="h-3.5 shrink-0 border-slate-600 px-1 font-mono text-[8px] text-slate-400">
                                    {tech.id}
                                  </Badge>
                                  <Badge variant="outline" className={`h-3.5 shrink-0 border px-1 text-[8px] ${tech.evidenceType === "observed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                                    {tech.evidenceType}
                                  </Badge>
                                  <span className="text-[10px] text-slate-300">{tech.name}</span>
                                  <span className="text-[9px] text-slate-500">— {tech.reasoning}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Known / Inferred / Unknown */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <EvidenceList label="Known Facts" items={atmMapping.knownFacts} tone="text-emerald-300" />
                    <EvidenceList label="Inferences" items={atmMapping.inferences} tone="text-amber-300" />
                    <EvidenceList label="Unknowns" items={atmMapping.unknowns} tone="text-slate-400" />
                  </div>

                  {/* Confidence + notes */}
                  <div className="flex items-center gap-2 border-t border-slate-700/40 pt-2">
                    <Badge variant="outline" className={`h-5 border px-1.5 text-[10px] ${
                      atmMapping.confidence === "high" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" :
                      atmMapping.confidence === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
                      "border-slate-600 bg-slate-700/20 text-slate-400"
                    }`}>
                      Confidence: {atmMapping.confidence}
                    </Badge>
                    <p className="text-[10px] text-slate-400">{atmMapping.analyticalNotes}</p>
                  </div>
                </div>
              ) : (
                <p className="py-2 text-[11px] text-slate-500">
                  Click "Map to ATM" to run the full 5-step attacker-intent-first ATM mapping methodology on this threat.
                </p>
              )}
            </div>

            {/* IOCs section */}
            {(iocsLoading || iocs) && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Fingerprint className="h-3.5 w-3.5 text-fuchsia-400" /> Indicators of Compromise
                  {iocs && iocs.method !== "none" && (
                    <Badge variant="outline" className="h-4 border-slate-600 px-1 text-[9px] text-slate-400">
                      {iocs.method === "llm" ? "AI-extracted" : "regex fallback"}
                    </Badge>
                  )}
                </h4>
                {iocsLoading ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Extracting IOCs…
                  </div>
                ) : iocs && hasAnyIoc(iocs) ? (
                  <div className="space-y-2">
                    <IocGroup label="CVEs" items={iocs.cves} color="rose" onCopy={copyToClipboard} copied={copied} prefix="cve" />
                    <IocGroup label="Threat Actors" items={iocs.actors} color="amber" onCopy={copyToClipboard} copied={copied} prefix="actor" />
                    <IocGroup label="Data Types" items={iocs.dataTypes} color="cyan" onCopy={copyToClipboard} copied={copied} prefix="dt" />
                    <IocGroup label="Components" items={iocs.components} color="emerald" onCopy={copyToClipboard} copied={copied} prefix="comp" />
                    <IocGroup label="Countries" items={iocs.countries} color="teal" onCopy={copyToClipboard} copied={copied} prefix="co" />
                    <IocGroup label="Other IOCs" items={iocs.misc} color="slate" onCopy={copyToClipboard} copied={copied} prefix="misc" />
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">No IOCs detected in this threat description.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="font-mono text-[10px] text-slate-500">
                Source: {threat.sourceName} · discovered {fmtDate(threat.discoveredAt)}
              </span>
              {threat.sourceUrl && (
                <Button asChild size="sm" variant="ghost" className="h-7 text-[11px] text-cyan-300 hover:bg-cyan-500/10">
                  <a href={threat.sourceUrl} target="_blank" rel="noopener noreferrer">
                    View source <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>

            {related.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Link2 className="h-3.5 w-3.5 text-emerald-400" /> Related Threats
                  <span className="font-mono text-slate-500">({related.length})</span>
                </h4>
                <div className="space-y-1.5">
                  {related.map((r) => {
                    const rSev = SEVERITY_META[r.severity as keyof typeof SEVERITY_META];
                    return (
                      <button
                        key={r.id}
                        onClick={() => onSelectRelated?.(r as unknown as Threat)}
                        className="group flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-slate-800/50"
                      >
                        <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1 text-[9px] font-bold uppercase ${rSev.bg} ${rSev.border} ${rSev.text}`}>
                          {rSev.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-slate-200 group-hover:text-emerald-200">{r.title}</p>
                          <p className="truncate text-[10px] text-slate-500">
                            {r.actor ?? "—"} · {r.automotiveCategory ?? "—"}{r.country ? ` · ${r.country}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {r.reasons.slice(0, 2).map((reason) => (
                            <span key={reason} className="rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] text-emerald-300">{reason}</span>
                          ))}
                          <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-emerald-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {relatedLoading && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading related threats…
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hasAnyIoc(iocs: IOCsResult): boolean {
  return Boolean(
    iocs.cves.length || iocs.actors.length || iocs.dataTypes.length || iocs.components.length || iocs.countries.length || iocs.misc.length,
  );
}

const IOC_COLOR_MAP: Record<string, string> = {
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:border-rose-500/50",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-500/50",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-500/50",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-500/50",
  teal: "border-teal-500/30 bg-teal-500/10 text-teal-200 hover:border-teal-500/50",
  slate: "border-slate-600 bg-slate-700/30 text-slate-200 hover:border-slate-500",
};

function IocGroup({
  label,
  items,
  color,
  onCopy,
  copied,
  prefix,
}: {
  label: string;
  items: string[];
  color: string;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
  prefix: string;
}) {
  if (items.length === 0) return null;
  const tone = IOC_COLOR_MAP[color] ?? IOC_COLOR_MAP.slate;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-24 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => {
          const key = `${prefix}-${i}-${item}`;
          const isCopied = copied === key;
          return (
            <button
              key={key}
              onClick={() => onCopy(item, key)}
              className={`group inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${tone}`}
              title={`Copy "${item}"`}
            >
              {item}
              {isCopied ? (
                <Check className="h-2.5 w-2.5 text-emerald-300" />
              ) : (
                <Copy className="h-2.5 w-2.5 opacity-50 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900/40 p-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="truncate text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 break-words">
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium text-slate-200">{value}</span>
    </div>
  );
}

function ContextRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 break-words text-slate-300">{value}</p>
    </div>
  );
}

function EvidenceList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{label} ({items.length})</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.slice(0, 5).map((item, i) => (
          <li key={i} className="text-[10px] leading-tight text-slate-400">{item}</li>
        ))}
        {items.length > 5 && <li className="text-[9px] text-slate-600">+{items.length - 5} more</li>}
      </ul>
    </div>
  );
}

// ---- Export helpers ---------------------------------------------------------

const EXPORT_COLUMNS: { key: keyof Threat; header: string }[] = [
  { key: "title", header: "title" },
  { key: "severity", header: "severity" },
  { key: "sourceName", header: "sourceName" },
  { key: "sourceType", header: "sourceType" },
  { key: "victimOrg", header: "victimOrg" },
  { key: "country", header: "country" },
  { key: "automotiveCategory", header: "automotiveCategory" },
  { key: "atmTactic", header: "atmTactic" },
  { key: "atmTechnique", header: "atmTechnique" },
  { key: "actor", header: "actor" },
  { key: "dataTypes", header: "dataTypes" },
  { key: "attackDate", header: "attackDate" },
  { key: "relevanceScore", header: "relevanceScore" },
  { key: "isAutomotive", header: "isAutomotive" },
  { key: "verified", header: "verified" },
];

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function threatsToCsv(items: Threat[]): string {
  const rows = items.map((t) =>
    EXPORT_COLUMNS.map((c) => csvEscape(t[c.key] as string | number | boolean | null)).join(","),
  );
  return [EXPORT_COLUMNS.map((c) => c.header).join(","), ...rows].join("\n");
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the click has flushed to the browser.
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportFilename(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `cartint-threats-${stamp}.${ext}`;
}

// ---- Feed table -------------------------------------------------------------

export function ThreatFeed({
  threats,
  total,
  loading,
  onSelect,
  search,
  setSearch,
  page,
  setPage,
  pageSize,
  includeRejected,
  setIncludeRejected,
  watchlistOnly,
  setWatchlistOnly,
  watchlistCount,
  isWatched,
  toggleWatch,
  searchInputId,
}: {
  threats: Threat[];
  total: number;
  loading: boolean;
  onSelect: (t: Threat) => void;
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  includeRejected: boolean;
  setIncludeRejected: (v: boolean) => void;
  watchlistOnly: boolean;
  setWatchlistOnly: (v: boolean) => void;
  watchlistCount: number;
  isWatched: (id: string) => boolean;
  toggleWatch: (id: string) => void;
  searchInputId: string;
}) {
  const [localSearch, setLocalSearch] = useState(search);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const exportDisabled = loading || threats.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Live Threat Feed
            <span className="ml-2 font-mono text-xs font-normal text-slate-400">
              {total} {includeRejected ? "items" : "automotive threats"}
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">
            {includeRejected
              ? "Showing all scraped items incl. rejected false positives (audit mode)"
              : "Only AI-classified automotive threats (confidence ≥ 70%)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id={searchInputId}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(localSearch);
                  setPage(0);
                }
                if (e.key === "Escape" && localSearch) {
                  setLocalSearch("");
                  setSearch("");
                  setPage(0);
                }
              }}
              placeholder="Search title, victim, actor…"
              className="h-8 w-44 rounded border border-slate-700 bg-slate-900/60 pl-8 pr-2 text-xs text-slate-200 transition-colors placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50 sm:w-56"
            />
          </div>
          <Button
            size="sm"
            variant={watchlistOnly ? "default" : "outline"}
            onClick={() => {
              setWatchlistOnly(!watchlistOnly);
              setPage(0);
            }}
            className={
              watchlistOnly
                ? "h-8 border-amber-400/50 bg-amber-400/20 text-amber-200 hover:bg-amber-400/25"
                : "h-8 border-slate-700 text-slate-300 hover:bg-slate-800"
            }
            title="Toggle watchlist filter (w)"
          >
            <Star className={`h-3.5 w-3.5 ${watchlistOnly ? "fill-amber-300" : ""}`} />
            Watchlist{watchlistCount > 0 ? ` (${watchlistCount})` : ""}
          </Button>
          <Button
            size="sm"
            variant={includeRejected ? "default" : "outline"}
            onClick={() => {
              setIncludeRejected(!includeRejected);
              setPage(0);
            }}
            className={
              includeRejected
                ? "h-8 border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                : "h-8 border-slate-700 text-slate-300 hover:bg-slate-800"
            }
          >
            <ShieldX className="h-3.5 w-3.5" />
            {includeRejected ? "Audit mode" : "Show FP audit"}
          </Button>
          <div className="hidden h-5 w-px bg-slate-700 sm:block" />
          <Button
            size="sm"
            variant="outline"
            disabled={exportDisabled}
            onClick={() => downloadBlob(threatsToCsv(threats), exportFilename("csv"), "text/csv;charset=utf-8;")}
            className="h-8 border-slate-700 text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exportDisabled}
            onClick={() => downloadBlob(JSON.stringify(threats, null, 2), exportFilename("json"), "application/json")}
            className="h-8 border-slate-700 text-slate-300 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
            <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="w-8 px-2 py-2 font-medium">★</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Threat</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Source</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Category</th>
              <th className="hidden px-3 py-2 font-medium xl:table-cell">ATM Tactic</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Date</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {loading && threats.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/40">
                    <td className="px-3 py-2.5" colSpan={9}>
                      <div className="h-3 animate-pulse rounded bg-slate-800/60" />
                    </td>
                  </tr>
                ))
              : threats.map((t, i) => {
                  const sev = SEVERITY_META[t.severity];
                  const srcMeta = sourceTypeMeta(t.sourceType);
                  const isRejected = !t.isAutomotive || t.relevanceScore < 70;
                  const watched = isWatched(t.id);
                  return (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3) }}
                      onClick={() => onSelect(t)}
                      className={`cursor-pointer border-b border-slate-800/40 transition-colors hover:bg-slate-800/40 hover:shadow-[inset_2px_0_0_0_rgba(16,185,129,0.6)] ${
                        t.severity === "critical" && !isRejected
                          ? "border-l-2 border-l-rose-500/50"
                          : watched
                            ? "border-l-2 border-l-amber-400/50"
                            : ""
                      }`}
                    >
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatch(t.id);
                          }}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-slate-700/50 ${
                            watched ? "text-amber-300" : "text-slate-600 hover:text-slate-400"
                          }`}
                          title={watched ? "Remove from watchlist" : "Add to watchlist"}
                          aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                        >
                          <Star className={`h-3.5 w-3.5 ${watched ? "fill-amber-300" : ""}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${sev.bg} ${sev.border} ${sev.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isRejected && <ShieldX className="h-3 w-3 shrink-0 text-amber-400" />}
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${isRejected ? "text-slate-400 line-through" : "text-slate-100"}`}>
                              {t.title}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">
                              {t.victimOrg ?? "—"} {t.actor && `· ${t.actor}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${srcMeta.tone}`}>{t.sourceName}</span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-slate-300 lg:table-cell">{t.automotiveCategory ?? "—"}</td>
                      <td className="hidden px-3 py-2.5 text-slate-400 xl:table-cell">{t.atmTactic ?? "—"}</td>
                      <td className="hidden px-3 py-2.5 text-slate-400 lg:table-cell">{fmtDate(t.attackDate)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`font-mono text-xs font-bold ${
                            t.relevanceScore >= 80 ? "text-emerald-300" : t.relevanceScore >= 60 ? "text-amber-300" : "text-slate-500"
                          }`}
                        >
                          {t.relevanceScore}
                        </span>
                      </td>
                      <td className="px-2 text-slate-600">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </td>
                    </motion.tr>
                  );
                })}
            {!loading && threats.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  {watchlistOnly
                    ? "Your watchlist is empty. Star threats (★) to track them here."
                    : "No threats match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-700/60 px-4 py-2 text-[11px] text-slate-400">
        <span>
          Page {page + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <Button size="sm" variant="outline" className="h-7 border-slate-700 px-2 text-xs" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

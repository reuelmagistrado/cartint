"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Skull, Crosshair, MapPin, Building2, Calendar, Database, Activity } from "lucide-react";
import type { Severity } from "./types";
import { SEVERITY_META, fmtDate, sourceTypeMeta } from "./types";

export type ActorProfile = {
  actor: string;
  totalThreats: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byCategory: { name: string; count: number }[];
  byCountry: { name: string; count: number }[];
  byTactic: { name: string; count: number }[];
  bySource: { name: string; count: number }[];
  victims: string[];
  dataTypes: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  threats: {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    sourceName: string;
    sourceType: string;
    automotiveCategory: string | null;
    atmTactic: string | null;
    atmTechnique: string | null;
    victimOrg: string | null;
    country: string | null;
    attackDate: string | null;
    relevanceScore: number;
    dataTypes: string | null;
  }[];
};

// Compact severity donut (pure SVG, no recharts). Shows the 4-severity split.
function SeverityDonut({ bySeverity, total }: { bySeverity: { critical: number; high: number; medium: number; low: number }; total: number }) {
  const segs = [
    { key: "critical", value: bySeverity.critical, color: "#f43f5e" },
    { key: "high", value: bySeverity.high, color: "#f59e0b" },
    { key: "medium", value: bySeverity.medium, color: "#facc15" },
    { key: "low", value: bySeverity.low, color: "#10b981" },
  ].filter((s) => s.value > 0);

  const r = 36;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-3">
      <svg width={92} height={92} viewBox="0 0 92 92" className="-rotate-90">
        <circle cx="46" cy="46" r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        {segs.map((s) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={s.key}
              cx="46"
              cy="46"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={10}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="46" y="46" textAnchor="middle" dominantBaseline="central" className="rotate-90" style={{ transformOrigin: "center", transform: "rotate(90deg)" }} fill="#e2e8f0" fontSize="18" fontWeight="bold" fontFamily="monospace">
          {total}
        </text>
      </svg>
      <div className="space-y-1 text-[10px]">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-300">{SEVERITY_META[s.key as Severity].label}</span>
            <span className="ml-auto font-mono text-slate-400">
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActorProfileDialog({
  actor,
  open,
  onOpenChange,
}: {
  actor: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [profile, setProfile] = useState<ActorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actor || !open) {
      queueMicrotask(() => {
        setProfile(null);
        setError(null);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(`/api/actors/${encodeURIComponent(actor)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
        } else {
          setProfile(json);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load actor profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actor, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-slate-700 bg-slate-950 p-0">
        <DialogHeader className="border-b border-slate-800 p-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-50">
            <Skull className="h-4 w-4 text-rose-400" />
            {actor ?? "Threat Actor"}
            {profile && (
              <Badge variant="outline" className="ml-1 h-5 border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-300">
                {profile.totalThreats} threat{profile.totalThreats === 1 ? "" : "s"}
              </Badge>
            )}
          </DialogTitle>
          {profile && (
            <DialogDescription className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              {profile.firstSeen && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> First seen {fmtDate(profile.firstSeen)}
                </span>
              )}
              {profile.lastSeen && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Last seen {fmtDate(profile.lastSeen)}
                </span>
              )}
              {profile.victims.length > 0 && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {profile.victims.length} victim{profile.victims.length === 1 ? "" : "s"}
                </span>
              )}
              {profile.byCountry.length > 0 && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {profile.byCountry.length} countr{profile.byCountry.length === 1 ? "y" : "ies"}
                </span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="p-5">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading actor profile…
              </div>
            ) : error ? (
              <p className="py-8 text-center text-sm text-slate-500">{error}</p>
            ) : profile ? (
              <div className="space-y-4">
                {/* Severity donut + key stats */}
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <SeverityDonut bySeverity={profile.bySeverity} total={profile.totalThreats} />
                  <div className="flex-1 space-y-1.5 text-[11px]">
                    <StatRow icon={Crosshair} label="Top ATM tactic" value={profile.byTactic[0]?.name ?? "—"} />
                    <StatRow icon={Activity} label="Top category" value={profile.byCategory[0]?.name ?? "—"} />
                    <StatRow icon={MapPin} label="Top country" value={profile.byCountry[0]?.name ?? "—"} />
                    <StatRow icon={Database} label="Top source" value={profile.bySource[0]?.name ?? "—"} />
                  </div>
                </div>

                {/* Targeted victims */}
                {profile.victims.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Targeted Victims ({profile.victims.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {profile.victims.map((v) => (
                        <Badge key={v} variant="outline" className="border-slate-600 bg-slate-800/40 px-1.5 text-[10px] text-slate-300">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data types exfiltrated */}
                {profile.dataTypes.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Data Types Targeted
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {profile.dataTypes.map((d) => (
                        <Badge key={d} variant="outline" className="border-cyan-500/30 bg-cyan-500/10 px-1.5 text-[10px] text-cyan-200">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Threat list */}
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Attributed Threats ({profile.threats.length}{profile.totalThreats > profile.threats.length ? ` of ${profile.totalThreats}` : ""})
                  </h4>
                  <div className="space-y-1.5">
                    {profile.threats.map((t) => {
                      const sev = SEVERITY_META[t.severity];
                      const srcMeta = sourceTypeMeta(t.sourceType);
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/40 p-2"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1 text-[9px] font-bold uppercase ${sev.bg} ${sev.border} ${sev.text}`}>
                              {sev.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-slate-200">{t.title}</p>
                              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                {t.victimOrg ?? "—"} · {t.automotiveCategory ?? "—"}{t.country ? ` · ${t.country}` : ""} · {fmtDate(t.attackDate)}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] font-bold text-emerald-300">{t.relevanceScore}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className={`h-4 border px-1 text-[9px] ${srcMeta.tone}`}>
                              {t.sourceName}
                            </Badge>
                            {t.atmTactic && (
                              <Badge variant="outline" className="h-4 border border-slate-600 px-1 text-[9px] text-slate-400">
                                {t.atmTactic}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 shrink-0 text-slate-500" />
      <span className="text-slate-500">{label}:</span>
      <span className="truncate font-medium text-slate-200">{value}</span>
    </div>
  );
}

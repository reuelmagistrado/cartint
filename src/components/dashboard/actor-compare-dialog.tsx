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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GitCompareArrows, X, Check, Trophy } from "lucide-react";
import type { Stats, Severity } from "./types";
import { SEVERITY_META } from "./types";

// Reuses the /api/actors/[name] shape (subset needed for comparison).
type ActorProfile = {
  actor: string;
  totalThreats: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byCategory: { name: string; count: number }[];
  byCountry: { name: string; count: number }[];
  byTactic: { name: string; count: number }[];
  victims: string[];
  dataTypes: string[];
  firstSeen: string | null;
  lastSeen: string | null;
};

const ACTOR_COLORS = ["#d946ef", "#10b981", "#f59e0b", "#06b6d4", "#f43f5e"];

export function ActorCompareDialog({
  open,
  onOpenChange,
  selectedActors,
  stats,
  onClearSelection,
  onToggleActor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedActors: string[];
  stats: Stats | null;
  onClearSelection: () => void;
  onToggleActor: (name: string) => void;
}) {
  const [profiles, setProfiles] = useState<ActorProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || selectedActors.length === 0) {
      queueMicrotask(() => setProfiles([]));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    Promise.all(
      selectedActors.slice(0, 3).map((name) =>
        fetch(`/api/actors/${encodeURIComponent(name)}`)
          .then((r) => r.json())
          .then((j) => (j.error ? null : (j as ActorProfile)))
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (!cancelled) setProfiles(results.filter(Boolean) as ActorProfile[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedActors]);

  // All actors available for selection (from stats.byActor, excluding unknown).
  const availableActors = (stats?.byActor ?? [])
    .filter((a) => a.name && a.name.toLowerCase() !== "unknown")
    .map((a) => a.name);

  const maxThreats = Math.max(1, ...profiles.map((p) => p.totalThreats));
  const maxCritical = Math.max(1, ...profiles.map((p) => p.bySeverity.critical));
  const maxVictims = Math.max(1, ...profiles.map((p) => p.victims.length));

  // Find the "leader" per metric for the trophy indicator.
  const leader = (getValue: (p: ActorProfile) => number) => {
    if (profiles.length < 2) return -1;
    let bestIdx = 0;
    let bestVal = getValue(profiles[0]);
    for (let i = 1; i < profiles.length; i++) {
      const v = getValue(profiles[i]);
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    return bestVal > 0 ? bestIdx : -1;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden border-slate-700 bg-slate-950 p-0">
        <DialogHeader className="border-b border-slate-800 p-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-50">
            <GitCompareArrows className="h-4 w-4 text-fuchsia-400" />
            Threat Actor Comparison
          </DialogTitle>
          <DialogDescription className="text-[11px] text-slate-400">
            Select up to 3 actors to compare side-by-side. Currently comparing {selectedActors.length}/3.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-4 p-5">
            {/* Actor selector */}
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Select Actors ({selectedActors.length}/3)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {availableActors.slice(0, 20).map((name) => {
                  const selected = selectedActors.includes(name);
                  const disabled = !selected && selectedActors.length >= 3;
                  return (
                    <button
                      key={name}
                      onClick={() => onToggleActor(name)}
                      disabled={disabled}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
                        selected
                          ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200"
                          : disabled
                            ? "border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed"
                            : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-fuchsia-500/40 hover:bg-slate-800/60"
                      }`}
                    >
                      {selected && <Check className="h-2.5 w-2.5" />}
                      {name}
                    </button>
                  );
                })}
              </div>
              {selectedActors.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearSelection}
                  className="mt-2 h-6 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <X className="h-3 w-3" /> Clear selection
                </Button>
              )}
            </div>

            {/* Comparison table */}
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading actor profiles…
              </div>
            ) : profiles.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Select 1–3 actors above to compare their threat profiles.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3 font-medium">Metric</th>
                      {profiles.map((p, i) => (
                        <th key={p.actor} className="px-3 py-2 font-mono font-semibold" style={{ color: ACTOR_COLORS[i] }}>
                          {p.actor}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <CompareRow label="Total threats" leader={leader((p) => p.totalThreats)} profiles={profiles} getValue={(p) => p.totalThreats} max={maxThreats} format={(v) => String(v)} />
                    <CompareRow label="Critical" leader={leader((p) => p.bySeverity.critical)} profiles={profiles} getValue={(p) => p.bySeverity.critical} max={maxCritical} format={(v) => String(v)} />
                    <CompareRow label="Victims" leader={leader((p) => p.victims.length)} profiles={profiles} getValue={(p) => p.victims.length} max={maxVictims} format={(v) => String(v)} />
                    <CompareRow label="First seen" profiles={profiles} getValue={(p) => (p.firstSeen ? new Date(p.firstSeen).getTime() : 0)} max={Date.now()} format={(v, p) => (p.firstSeen ? new Date(p.firstSeen).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")} />
                    <CompareRow label="Last seen" profiles={profiles} getValue={(p) => (p.lastSeen ? new Date(p.lastSeen).getTime() : 0)} max={Date.now()} format={(v, p) => (p.lastSeen ? new Date(p.lastSeen).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")} />
                  </tbody>
                </table>

                {/* Severity breakdown bars */}
                <div className="mt-4">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Severity Breakdown</h4>
                  <div className="space-y-2">
                    {profiles.map((p, i) => {
                      const total = p.totalThreats || 1;
                      return (
                        <div key={p.actor} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate font-mono text-[10px]" style={{ color: ACTOR_COLORS[i] }}>
                            {p.actor}
                          </span>
                          <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                            {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
                              const v = p.bySeverity[sev];
                              if (v === 0) return null;
                              return (
                                <div
                                  key={sev}
                                  style={{ width: `${(v / total) * 100}%`, background: SEVERITY_META[sev].hex }}
                                  title={`${SEVERITY_META[sev].label}: ${v}`}
                                />
                              );
                            })}
                          </div>
                          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-400">{p.totalThreats}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top tactics per actor */}
                <div className="mt-4">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Top ATM Tactics</h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {profiles.map((p, i) => (
                      <div key={p.actor} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                        <p className="mb-1 truncate font-mono text-[10px] font-semibold" style={{ color: ACTOR_COLORS[i] }}>
                          {p.actor}
                        </p>
                        {p.byTactic.length === 0 ? (
                          <p className="text-[10px] text-slate-500">No tactics mapped</p>
                        ) : (
                          <div className="space-y-0.5">
                            {p.byTactic.slice(0, 4).map((t) => (
                              <div key={t.name} className="flex items-center justify-between text-[10px]">
                                <span className="truncate text-slate-300">{t.name}</span>
                                <span className="ml-1 font-mono text-slate-500">{t.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Targeted victims */}
                <div className="mt-4">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Targeted Victims</h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {profiles.map((p, i) => (
                      <div key={p.actor} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                        <p className="mb-1 truncate font-mono text-[10px] font-semibold" style={{ color: ACTOR_COLORS[i] }}>
                          {p.actor} <span className="text-slate-500">({p.victims.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {p.victims.slice(0, 6).map((v) => (
                            <Badge key={v} variant="outline" className="h-4 border-slate-600 px-1 text-[9px] text-slate-300">
                              {v}
                            </Badge>
                          ))}
                          {p.victims.length > 6 && (
                            <span className="text-[9px] text-slate-500">+{p.victims.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function CompareRow({
  label,
  profiles,
  getValue,
  max,
  format,
  leader = -1,
}: {
  label: string;
  profiles: ActorProfile[];
  getValue: (p: ActorProfile) => number;
  max: number;
  format: (v: number, p: ActorProfile) => string;
  leader?: number;
}) {
  return (
    <tr>
      <td className="py-2 pr-3 text-[11px] text-slate-400">{label}</td>
      {profiles.map((p, i) => {
        const v = getValue(p);
        const isLeader = leader === i && profiles.length > 1;
        return (
          <td key={p.actor} className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              {isLeader && <Trophy className="h-3 w-3 text-amber-400" />}
              <span className={`font-mono text-[11px] ${isLeader ? "font-bold text-amber-200" : "text-slate-200"}`}>
                {format(v, p)}
              </span>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

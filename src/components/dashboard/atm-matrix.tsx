"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ChevronRight, Crosshair } from "lucide-react";
import type { AtmTacticData, Threat } from "./types";
import { SEVERITY_META, fmtDate } from "./types";

function heatColor(ratio: number): string {
  if (ratio <= 0) return "bg-slate-800/40 border-slate-700/40 text-slate-500";
  if (ratio < 0.25) return "bg-emerald-500/15 border-emerald-500/30 text-emerald-200";
  if (ratio < 0.5) return "bg-amber-500/20 border-amber-500/40 text-amber-200";
  if (ratio < 0.75) return "bg-orange-500/25 border-orange-500/50 text-orange-200";
  return "bg-rose-500/30 border-rose-500/50 text-rose-100";
}

export function AtmMatrix({
  tactics,
  maxCount,
  loading,
}: {
  tactics: AtmTacticData[];
  maxCount: number;
  loading: boolean;
}) {
  const total = tactics.reduce((sum, t) => sum + t.count, 0);
  const [drillTactic, setDrillTactic] = useState<AtmTacticData | null>(null);
  const [drillThreats, setDrillThreats] = useState<Threat[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (!drillTactic) {
      queueMicrotask(() => setDrillThreats([]));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setDrillLoading(true));
    const params = new URLSearchParams({ tactic: drillTactic.name, limit: "12", includeRejected: "0" });
    fetch(`/api/threats?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setDrillThreats(json.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setDrillThreats([]);
      })
      .finally(() => {
        if (!cancelled) setDrillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drillTactic]);

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="font-mono text-emerald-400">ATM</span> Auto-ISAC Automotive Threat Matrix
          </h3>
          <p className="text-[11px] text-slate-400">
            {total} accepted threats mapped across {tactics.length} tactics · click a tactic to drill down
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>low</span>
          <div className="flex h-2.5 w-28 overflow-hidden rounded">
            <div className="flex-1 bg-slate-800" />
            <div className="flex-1 bg-emerald-500/40" />
            <div className="flex-1 bg-amber-500/50" />
            <div className="flex-1 bg-orange-500/60" />
            <div className="flex-1 bg-rose-500/70" />
          </div>
          <span>high</span>
        </div>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className={`grid grid-cols-1 gap-2 ${loading ? "opacity-60" : ""}`}>
          {tactics.map((t, i) => {
            const ratio = maxCount > 0 ? t.count / maxCount : 0;
            const hasThreats = t.count > 0;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => hasThreats && setDrillTactic(t)}
                className={`rounded-lg border border-slate-700/50 bg-slate-800/20 p-2.5 ${
                  hasThreats ? "cursor-pointer transition-colors hover:border-emerald-500/40 hover:bg-slate-800/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex h-7 min-w-[2rem] items-center justify-center rounded border px-1.5 font-mono text-xs font-bold ${heatColor(ratio)}`}>
                          {t.count}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="border-slate-700 bg-slate-900 text-xs">
                        {t.description}
                      </TooltipContent>
                    </Tooltip>
                    <span className="truncate text-xs font-medium text-slate-200">{t.name}</span>
                    {hasThreats && <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />}
                  </div>
                  <span className="hidden shrink-0 text-[10px] text-slate-500 sm:inline">{t.techniques.length} techniques</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.techniques.map((tech) => {
                    const tr = maxCount > 0 ? tech.count / maxCount : 0;
                    return (
                      <Tooltip key={tech.id}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`cursor-default border px-1.5 py-0.5 text-[10px] font-normal ${heatColor(tr)}`}
                          >
                            {tech.count > 0 && <span className="mr-1 font-mono font-bold">{tech.count}</span>}
                            {tech.name}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] border-slate-700 bg-slate-900 text-xs">
                          <p className="font-mono text-[10px] text-slate-400">{tech.id}</p>
                          <p>{tech.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </TooltipProvider>

      {/* ATM tactic drill-down dialog */}
      <Dialog open={!!drillTactic} onOpenChange={(v) => !v && setDrillTactic(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden border-slate-700 bg-slate-950 p-0">
          {drillTactic && (
            <>
              <DialogHeader className="border-b border-slate-800 p-5 pb-4">
                <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-50">
                  <Crosshair className="h-4 w-4 text-emerald-400" />
                  {drillTactic.name}
                  <Badge variant="outline" className="ml-1 h-5 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">
                    {drillTactic.count} threat{drillTactic.count === 1 ? "" : "s"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-400">
                  {drillTactic.description}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[65vh]">
                <div className="space-y-4 p-5">
                  {/* Technique breakdown */}
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Techniques ({drillTactic.techniques.length})
                    </h4>
                    <div className="space-y-1">
                      {drillTactic.techniques.map((tech) => (
                        <div
                          key={tech.id}
                          className={`flex items-center gap-2 rounded border p-2 ${
                            tech.count > 0 ? "border-slate-700 bg-slate-900/50" : "border-slate-800 bg-slate-900/20 opacity-60"
                          }`}
                        >
                          <div className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded font-mono text-[11px] font-bold ${heatColor(maxCount > 0 ? tech.count / maxCount : 0)}`}>
                            {tech.count}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium text-slate-200">{tech.name}</p>
                            <p className="truncate text-[10px] text-slate-500">{tech.description}</p>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] text-slate-600">{tech.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Example threats */}
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Example Threats
                    </h4>
                    {drillLoading ? (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading threats…
                      </div>
                    ) : drillThreats.length === 0 ? (
                      <p className="text-[11px] text-slate-500">No threats found for this tactic.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {drillThreats.map((t) => {
                          const sev = SEVERITY_META[t.severity];
                          return (
                            <div
                              key={t.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2"
                            >
                              <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1 text-[9px] font-bold uppercase ${sev.bg} ${sev.border} ${sev.text}`}>
                                {sev.label}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-medium text-slate-200">{t.title}</p>
                                <p className="truncate text-[10px] text-slate-500">
                                  {t.victimOrg ?? "—"} · {t.automotiveCategory ?? "—"} · {fmtDate(t.attackDate)}
                                </p>
                              </div>
                              <span className="shrink-0 font-mono text-[10px] font-bold text-emerald-300">{t.relevanceScore}</span>
                              {t.atmTechnique && (
                                <Badge variant="outline" className="hidden shrink-0 border-slate-600 px-1 text-[9px] text-slate-400 sm:inline">
                                  {t.atmTechnique}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

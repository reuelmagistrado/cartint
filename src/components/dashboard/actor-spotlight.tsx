"use client";

import { motion } from "framer-motion";
import { Skull, TrendingUp, AlertCircle, GitCompareArrows, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Stats } from "./types";

// Severity tier per actor — derived from absolute count thresholds.
function actorTier(count: number): { label: string; tone: string; bar: string; dot: string } {
  if (count >= 4)
    return {
      label: "Critical",
      tone: "text-rose-300 bg-rose-500/10 border-rose-500/40",
      bar: "from-rose-500 to-rose-400",
      dot: "bg-rose-500",
    };
  if (count >= 2)
    return {
      label: "High",
      tone: "text-amber-300 bg-amber-500/10 border-amber-500/40",
      bar: "from-amber-500 to-amber-400",
      dot: "bg-amber-500",
    };
  return {
    label: "Active",
    tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40",
    bar: "from-emerald-500 to-emerald-400",
    dot: "bg-emerald-500",
  };
}

export function ActorSpotlight({
  stats,
  onSelectActor,
  compareActors = [],
  onToggleCompare,
  onOpenCompare,
}: {
  stats: Stats | null;
  onSelectActor?: (actor: string) => void;
  compareActors?: string[];
  onToggleCompare?: (actor: string) => void;
  onOpenCompare?: () => void;
}) {
  const actors = (stats?.byActor ?? []).filter((a) => a.name && a.name.toLowerCase() !== "unknown");
  const max = actors.reduce((m, a) => Math.max(m, a.count), 0);
  const total = actors.reduce((s, a) => s + a.count, 0);
  const top = actors[0];
  const compareCount = compareActors.length;

  return (
    <Card className="flex max-h-[560px] min-h-0 flex-col overflow-hidden border-slate-700/60 bg-slate-900/40">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Skull className="h-4 w-4 text-fuchsia-400" /> Threat Actor Spotlight
          </h3>
          <p className="text-[11px] text-slate-400">
            Most active ransomware groups & dark-web vendors
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compareCount > 0 && (
            <Button
              size="sm"
              onClick={onOpenCompare}
              className="h-7 border-fuchsia-500/40 bg-fuchsia-500/15 px-2 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/25"
            >
              <GitCompareArrows className="h-3 w-3" />
              Compare ({compareCount})
            </Button>
          )}
          <Badge variant="outline" className="h-5 border-fuchsia-500/40 bg-fuchsia-500/10 px-2 text-[10px] text-fuchsia-300">
            {actors.length} actors
          </Badge>
        </div>
      </div>

      {/* Most active actor highlight */}
      {top && (
        <button
          type="button"
          onClick={() => onSelectActor?.(top.name)}
          className="group block w-full shrink-0 border-b border-slate-700/60 bg-gradient-to-r from-fuchsia-950/40 via-slate-900/20 to-transparent p-4 text-left transition-colors hover:from-fuchsia-950/60"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fuchsia-300/80">
            <TrendingUp className="h-3 w-3" /> Most active actor
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-base font-bold text-fuchsia-200 group-hover:text-fuchsia-100">{top.name}</p>
              <p className="text-[11px] text-slate-400">
                {top.count} automotive threat{top.count === 1 ? "" : "s"} ·{" "}
                {total > 0 ? Math.round((top.count / total) * 100) : 0}% of attributed
              </p>
            </div>
            <div className="flex shrink-0 items-end gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${i < Math.min(top.count, 5) * 4 + 8}px` }}
                  transition={{ delay: i * 0.05, type: "spring", stiffness: 200 }}
                  className="w-1.5 rounded-sm bg-fuchsia-500/70"
                  style={{ height: `${Math.min(i + 1, top.count) * 4 + 8}px` }}
                />
              ))}
            </div>
          </div>
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4" style={{ scrollbarWidth: "thin" }}>
        <TooltipProvider delayDuration={120}>
          <ul className="divide-y divide-slate-800/60">
            {actors.length === 0 && (
              <li className="p-4 text-center text-xs text-slate-500">
                <AlertCircle className="mx-auto mb-1 h-4 w-4 text-slate-600" />
                No attributed threat actors yet.
              </li>
            )}
            {actors.map((a, i) => {
              const tier = actorTier(a.count);
              const pct = max > 0 ? Math.round((a.count / max) * 100) : 0;
              return (
                <motion.li
                  key={a.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => onSelectActor?.(a.name)}
                  className="group cursor-pointer p-3 transition-colors hover:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${tier.dot}`} />
                      <span className="truncate font-mono text-xs font-semibold text-slate-100 group-hover:text-fuchsia-200">{a.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {onToggleCompare && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompare(a.name);
                          }}
                          disabled={!compareActors.includes(a.name) && compareCount >= 3}
                          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            compareActors.includes(a.name)
                              ? "border-fuchsia-500/60 bg-fuchsia-500/30 text-fuchsia-200"
                              : compareCount >= 3
                                ? "border-slate-800 bg-slate-900/30 text-slate-700 cursor-not-allowed"
                                : "border-slate-600 text-transparent hover:border-fuchsia-500/40 hover:bg-slate-800"
                          }`}
                          title={compareActors.includes(a.name) ? "Remove from comparison" : "Add to comparison (max 3)"}
                          aria-label={compareActors.includes(a.name) ? "Remove from comparison" : "Add to comparison"}
                        >
                          <Check className="h-2.5 w-2.5" />
                        </button>
                      )}
                      <Badge variant="outline" className={`h-4 border px-1.5 text-[9px] ${tier.tone}`}>
                        {tier.label}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-sm font-bold text-slate-200">{a.count}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="border-slate-700 bg-slate-900 text-xs">
                          {a.count} attributed threat{a.count === 1 ? "" : "s"} · click to view profile
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) + 0.1, duration: 0.5 }}
                      className={`h-full rounded-full bg-gradient-to-r ${tier.bar}`}
                    />
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </TooltipProvider>
      </div>
    </Card>
  );
}

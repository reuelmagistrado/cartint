"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AtmTacticData } from "./types";

function heatColor(ratio: number): string {
  // 0 -> slate, 1 -> emerald/red intensity
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
  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="font-mono text-emerald-400">ATM</span> Auto-ISAC Automotive Threat Matrix
          </h3>
          <p className="text-[11px] text-slate-400">
            {total} accepted threats mapped across {tactics.length} tactics · color = threat density
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
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-2.5"
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
    </Card>
  );
}

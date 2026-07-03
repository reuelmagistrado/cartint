"use client";

import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Stats } from "./types";

// Flag-ish accent colors per known country (defaults to a calm slate-emerald).
const COUNTRY_COLORS: Record<string, string> = {
  "United States": "#10b981",
  Germany: "#f59e0b",
  Japan: "#f43f5e",
  Taiwan: "#14b8a6",
  Russia: "#d946ef",
  Netherlands: "#facc15",
  India: "#06b6d4",
  "United Kingdom": "#8b5cf6",
  China: "#f43f5e",
  SouthKorea: "#5eead4",
  France: "#84cc16",
  Italy: "#f97316",
  Mexico: "#22c55e",
  Brazil: "#eab308",
  Canada: "#ef4444",
};

function colorFor(country: string): string {
  return COUNTRY_COLORS[country] ?? "#10b981";
}

function flagEmoji(country: string): string {
  const map: Record<string, string> = {
    "United States": "🇺🇸",
    Germany: "🇩🇪",
    Japan: "🇯🇵",
    Taiwan: "🇹🇼",
    Russia: "🇷🇺",
    Netherlands: "🇳🇱",
    India: "🇮🇳",
    "United Kingdom": "🇬🇧",
    China: "🇨🇳",
    SouthKorea: "🇰🇷",
    France: "🇫🇷",
    Italy: "🇮🇹",
    Mexico: "🇲🇽",
    Brazil: "🇧🇷",
    Canada: "🇨🇦",
  };
  return map[country] ?? "🏳️";
}

export function GeoDistribution({ stats }: { stats: Stats | null }) {
  const countries = stats?.byCountry ?? [];
  const max = countries.reduce((m, c) => Math.max(m, c.count), 0);
  const total = countries.reduce((s, c) => s + c.count, 0);

  return (
    <Card className="flex flex-col border-slate-700/60 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Globe className="h-4 w-4 text-cyan-400" /> Geographic Threat Distribution
          </h3>
          <p className="text-[11px] text-slate-400">
            Top countries affected by automotive threats
          </p>
        </div>
        <Badge variant="outline" className="h-5 border-cyan-500/40 bg-cyan-500/10 px-2 text-[10px] text-cyan-300">
          {countries.length} countries
        </Badge>
      </div>

      <ScrollArea className="max-h-[280px]">
        <div className="p-3">
          {countries.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-slate-800/40" />
              ))}
            </div>
          ) : (
            <TooltipProvider delayDuration={120}>
              <ul className="space-y-1.5">
                {countries.map((c, i) => {
                  const pct = max > 0 ? Math.max(4, Math.round((c.count / max) * 100)) : 0;
                  const sharePct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                  const color = colorFor(c.name);
                  return (
                    <motion.li
                      key={c.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="group relative overflow-hidden rounded-md border border-slate-800/60 bg-slate-900/40 transition-colors hover:border-slate-700"
                    >
                      {/* Proportional bar background */}
                      <div
                        className="absolute inset-y-0 left-0 opacity-25 transition-all duration-500"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, transparent)` }}
                      />
                      <div className="relative flex items-center gap-2.5 px-3 py-2">
                        <span className="text-base leading-none">{flagEmoji(c.name)}</span>
                        <div className="flex h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-100">{c.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">{sharePct}%</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="font-mono text-sm font-bold"
                                style={{ color }}
                              >
                                {c.count}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="border-slate-700 bg-slate-900 text-xs">
                              {c.count} threat{c.count === 1 ? "" : "s"} · {sharePct}% of {total}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </TooltipProvider>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Grid3x3, Filter } from "lucide-react";
import type { AtmTacticData, Threat } from "./types";
import { SEVERITY_META } from "./types";

export function AtmMatrixView({
  tactics,
  threats,
  loading,
}: {
  tactics: AtmTacticData[];
  threats: Threat[];
  loading: boolean;
}) {
  const [selectedThreatId, setSelectedThreatId] = useState<string>("all");

  // Build a set of tactic+technique names that the selected threat maps to
  const highlightedTactics = useMemo(() => {
    if (selectedThreatId === "all") return null; // null = no filter, show all normally
    const threat = threats.find((t) => t.id === selectedThreatId);
    if (!threat) return null;
    return {
      tactic: threat.atmTactic?.toLowerCase(),
      technique: threat.atmTechnique?.toLowerCase(),
    };
  }, [selectedThreatId, threats]);

  // Only show accepted threats that have ATM mapping for the filter dropdown
  const mappedThreats = useMemo(() => {
    return threats.filter((t) => t.atmTactic || t.atmTechnique);
  }, [threats]);

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <Card className="border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <Grid3x3 className="h-5 w-5 text-emerald-400" />
              Auto-ISAC Automotive Threat Matrix
            </h2>
            <p className="text-[11px] text-slate-400">
              {tactics.length} tactics · {tactics.reduce((s, t) => s + t.techniques.length, 0)} techniques · horizontally scrollable grid
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <Select value={selectedThreatId} onValueChange={setSelectedThreatId}>
              <SelectTrigger className="w-[320px] border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                <SelectValue placeholder="Select threat to map techniques..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] border-slate-700 bg-slate-950 text-slate-200">
                <SelectItem value="all">All threats (no filter)</SelectItem>
                {mappedThreats.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="truncate">{t.title.slice(0, 60)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {highlightedTactics && (
          <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-300">
            Highlighting: <span className="font-semibold">{highlightedTactics.tactic}</span>
            {highlightedTactics.technique && (
              <> → <span className="font-semibold">{highlightedTactics.technique}</span></>
            )}
          </div>
        )}
      </Card>

      {/* Matrix grid — horizontally scrollable */}
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {tactics.map((tactic, i) => {
            const isHighlighted = highlightedTactics?.tactic === tactic.name.toLowerCase();
            const isDimmed = highlightedTactics && !isHighlighted;

            return (
              <motion.div
                key={tactic.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: isDimmed ? 0.4 : 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex w-[240px] shrink-0 flex-col rounded-xl border ${
                  isHighlighted
                    ? "border-emerald-500/60 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
                    : "border-slate-700/60 bg-slate-900/40"
                }`}
              >
                {/* Tactic header */}
                <div className={`shrink-0 border-b p-3 ${isHighlighted ? "border-emerald-500/40" : "border-slate-700/60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-slate-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {tactic.count > 0 && (
                      <Badge variant="outline" className="h-5 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-300">
                        {tactic.count}
                      </Badge>
                    )}
                  </div>
                  <h3 className={`mt-1 text-xs font-bold leading-tight ${isHighlighted ? "text-emerald-200" : "text-slate-100"}`}>
                    {tactic.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">
                    {tactic.description.slice(0, 80)}
                  </p>
                </div>

                {/* Technique cards */}
                <div className="flex-1 space-y-1.5 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
                  {tactic.techniques.map((tech) => {
                    const isTechHighlighted = highlightedTactics?.technique === tech.name.toLowerCase();
                    const isTechDimmed = highlightedTactics && !isTechHighlighted && !isHighlighted;

                    return (
                      <div
                        key={tech.id}
                        className={`rounded-lg border p-2 transition-all ${
                          isTechHighlighted
                            ? "border-emerald-500/60 bg-emerald-500/15 shadow-md shadow-emerald-500/10"
                            : isTechDimmed
                              ? "border-slate-800 bg-slate-900/20 opacity-50"
                              : tech.count > 0
                                ? "border-slate-600 bg-slate-800/40"
                                : "border-slate-800 bg-slate-900/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-mono text-[9px] text-slate-500">{tech.id}</span>
                          {tech.count > 0 && (
                            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded bg-emerald-500/20 px-1 font-mono text-[9px] font-bold text-emerald-300">
                              {tech.count}
                            </span>
                          )}
                        </div>
                        <p className={`mt-0.5 text-[10px] font-medium leading-tight ${
                          isTechHighlighted ? "text-emerald-100" : "text-slate-200"
                        }`}>
                          {tech.name}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-500">
                          {tech.description.slice(0, 80)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

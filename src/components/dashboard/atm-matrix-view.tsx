"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Grid3x3, Filter, Brain, Loader2, Target, Eye, AlertCircle, GitBranch, ChevronDown, ChevronUp } from "lucide-react";
import type { AtmTacticData, Threat, AtmMappingResult } from "./types";

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
  const [mapping, setMapping] = useState<AtmMappingResult | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [showMappingDetails, setShowMappingDetails] = useState(false);

  // When a threat is selected, check if it has ATM mapping. If not, auto-trigger AI mapping.
  const selectedThreat = useMemo(() => {
    if (selectedThreatId === "all") return null;
    return threats.find((t) => t.id === selectedThreatId) ?? null;
  }, [selectedThreatId, threats]);

  const runMapping = useCallback(async (threatId: string) => {
    setMappingLoading(true);
    setMapping(null);
    try {
      const res = await fetch(`/api/threats/${threatId}/map-atm`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setMapping(json.mapping);
        setShowMappingDetails(true);
      }
    } catch {
      // non-fatal
    } finally {
      setMappingLoading(false);
    }
  }, []);

  // Auto-trigger mapping when a threat without ATM mapping is selected
  useEffect(() => {
    if (!selectedThreat) {
      setMapping(null);
      return;
    }
    // If the threat already has ATM tactic+technique, use the existing mapping
    // (no need to re-run the AI). If not, auto-trigger the AI mapping.
    if (!selectedThreat.atmTactic && !selectedThreat.atmTechnique) {
      runMapping(selectedThreat.id);
    } else {
      setMapping(null);
    }
  }, [selectedThreat, runMapping]);

  // Build highlighted tactics from either the AI mapping result or the threat's stored ATM mapping
  const highlightedTactics = useMemo(() => {
    if (selectedThreatId === "all" || !selectedThreat) return null;

    // If we have an AI mapping result, use all mapped tactics + techniques
    if (mapping) {
      const tacticNames = new Set(mapping.tactics.map((t) => t.name.toLowerCase()));
      const techniqueNames = new Set<string>();
      for (const t of mapping.tactics) {
        for (const tech of t.techniques) {
          techniqueNames.add(tech.name.toLowerCase());
        }
      }
      return { tacticNames, techniqueNames, primaryTactic: mapping.tactics[0]?.name.toLowerCase() };
    }

    // Fall back to the threat's stored ATM mapping
    if (selectedThreat.atmTactic || selectedThreat.atmTechnique) {
      return {
        tacticNames: new Set([selectedThreat.atmTactic?.toLowerCase()].filter(Boolean) as string[]),
        techniqueNames: new Set([selectedThreat.atmTechnique?.toLowerCase()].filter(Boolean) as string[]),
        primaryTactic: selectedThreat.atmTactic?.toLowerCase(),
      };
    }

    return null;
  }, [selectedThreatId, selectedThreat, mapping]);

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
            <Select
              value={selectedThreatId}
              onValueChange={(v) => {
                setSelectedThreatId(v);
                setMapping(null);
                setShowMappingDetails(false);
              }}
            >
              <SelectTrigger className="w-[360px] border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                <SelectValue placeholder="Select threat to map techniques..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] border-slate-700 bg-slate-950 text-slate-200">
                <SelectItem value="all">All threats (no filter)</SelectItem>
                {threats.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-1.5">
                      {t.atmTactic ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                      )}
                      <span className="truncate">{t.title.slice(0, 55)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mapping status banner */}
        {selectedThreat && (
          <div className="mt-2">
            {mappingLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running AI ATM mapping (5-step attacker-intent methodology) on: <span className="font-semibold">{selectedThreat.title.slice(0, 50)}</span>
              </div>
            ) : mapping ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-300">
                    <Brain className="h-3.5 w-3.5" />
                    <span>AI mapped to <strong>{mapping.tactics.length}</strong> tactic(s):</span>
                    {mapping.tactics.map((t, i) => (
                      <Badge key={i} variant="outline" className="h-4 border-emerald-500/40 bg-emerald-500/10 px-1 text-[9px] text-emerald-300">
                        {t.name}
                      </Badge>
                    ))}
                    <span className="text-slate-500">· Confidence: <strong className={mapping.confidence === "high" ? "text-emerald-300" : mapping.confidence === "medium" ? "text-amber-300" : "text-slate-400"}>{mapping.confidence}</strong></span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    onClick={() => setShowMappingDetails(!showMappingDetails)}
                  >
                    {showMappingDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showMappingDetails ? "Hide" : "Show"} analysis
                  </Button>
                </div>

                {/* Expandable AI mapping details */}
                {showMappingDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-3 rounded-lg border border-cyan-500/20 bg-slate-900/50 p-3"
                  >
                    {/* Incident context */}
                    <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                      <ContextRow icon={Target} label="Target Asset" value={mapping.incidentContext.targetAsset} />
                      <ContextRow icon={Eye} label="Attack Surface" value={mapping.incidentContext.attackSurface} />
                      <ContextRow icon={AlertCircle} label="Observed Effect" value={mapping.incidentContext.observedEffect} />
                      <ContextRow icon={GitBranch} label="Vehicle Consequence" value={mapping.incidentContext.vehicleLevelConsequence} />
                    </div>

                    {/* Attacker intent */}
                    <div className="rounded border border-slate-700/50 bg-slate-800/30 p-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Attacker Intent Reconstruction</p>
                      <p className="text-[11px] leading-relaxed text-slate-300">{mapping.attackerIntent}</p>
                    </div>

                    {/* Mapped tactics + techniques */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Mapped Tactics & Techniques ({mapping.tactics.length})
                      </p>
                      <div className="space-y-1.5">
                        {mapping.tactics.map((t, ti) => (
                          <div key={ti} className="rounded border border-slate-700/40 bg-slate-800/20 p-2">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`h-4 border px-1 text-[9px] ${t.evidenceType === "observed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
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
                      <EvidenceList label="Known Facts" items={mapping.knownFacts} tone="text-emerald-300" />
                      <EvidenceList label="Inferences" items={mapping.inferences} tone="text-amber-300" />
                      <EvidenceList label="Unknowns" items={mapping.unknowns} tone="text-slate-400" />
                    </div>

                    {/* Analytical notes */}
                    <div className="border-t border-slate-700/40 pt-2">
                      <p className="text-[10px] text-slate-400">{mapping.analyticalNotes}</p>
                    </div>

                    {/* Re-map button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runMapping(selectedThreat.id)}
                      disabled={mappingLoading}
                      className="h-6 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    >
                      <Brain className="h-3 w-3" /> Re-map with AI
                    </Button>
                  </motion.div>
                )}
              </div>
            ) : selectedThreat?.atmTactic ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-300">
                Highlighting stored mapping: <span className="font-semibold">{selectedThreat.atmTactic}</span>
                {selectedThreat.atmTechnique && <> → <span className="font-semibold">{selectedThreat.atmTechnique}</span></>}
                <button
                  onClick={() => runMapping(selectedThreat.id)}
                  className="ml-2 text-cyan-400 underline hover:text-cyan-300"
                >
                  Re-map with AI
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Matrix grid — horizontally scrollable */}
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {tactics.map((tactic, i) => {
            const isHighlighted = highlightedTactics?.tacticNames.has(tactic.name.toLowerCase()) ?? false;
            const isPrimary = highlightedTactics?.primaryTactic === tactic.name.toLowerCase();
            const isDimmed = highlightedTactics && !isHighlighted;

            return (
              <motion.div
                key={tactic.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: isDimmed ? 0.35 : 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex w-[240px] shrink-0 flex-col rounded-xl border ${
                  isPrimary
                    ? "border-emerald-500/60 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
                    : isHighlighted
                      ? "border-cyan-500/40 bg-cyan-500/5"
                      : "border-slate-700/60 bg-slate-900/40"
                }`}
              >
                {/* Tactic header */}
                <div className={`shrink-0 border-b p-3 ${isPrimary ? "border-emerald-500/40" : isHighlighted ? "border-cyan-500/30" : "border-slate-700/60"}`}>
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
                  <h3 className={`mt-1 text-xs font-bold leading-tight ${
                    isPrimary ? "text-emerald-200" : isHighlighted ? "text-cyan-200" : "text-slate-100"
                  }`}>
                    {tactic.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">
                    {tactic.description.slice(0, 80)}
                  </p>
                </div>

                {/* Technique cards */}
                <div className="flex-1 space-y-1.5 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
                  {tactic.techniques.map((tech) => {
                    const isTechHighlighted = highlightedTactics?.techniqueNames.has(tech.name.toLowerCase()) ?? false;
                    const isTechDimmed = highlightedTactics && !isTechHighlighted && !isHighlighted;

                    return (
                      <div
                        key={tech.id}
                        className={`rounded-lg border p-2 transition-all ${
                          isTechHighlighted
                            ? "border-emerald-500/60 bg-emerald-500/15 shadow-md shadow-emerald-500/10"
                            : isTechDimmed
                              ? "border-slate-800 bg-slate-900/20 opacity-40"
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

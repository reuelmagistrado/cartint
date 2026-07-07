"use client";

import { motion } from "framer-motion";
import { ShieldAlert, Flame, ShieldCheck, Radar, FilterX, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Stats } from "./types";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const safeData = data.length > 0 ? data : [1, 1, 1, 1];
  const w = 100, h = 18;
  const max = Math.max(1, ...safeData);
  const step = safeData.length > 1 ? w / (safeData.length - 1) : w;
  const pts = safeData.map((v, i) => { const x = i * step; const y = h - (v / max) * (h - 2) - 1; return [x, y] as const; });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" preserveAspectRatio="none">
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={1.6} fill={color} />}
    </svg>
  );
}

export function KpiCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const trend = stats?.trend ?? [];
  const totals = trend.map((t) => t.critical + t.high + t.medium + t.low);
  const criticalTrend = trend.map((t) => t.critical);
  const highTrend = trend.map((t) => t.high);
  const lowTrend = trend.map((t) => t.low);
  const baseline = totals.length > 0 ? totals : [1, 1, 1, 1];

  const items = [
    { key: "total", label: "Active Threats", value: String(stats?.totalThreats ?? 0), sub: `${stats?.verifiedCount ?? 0} verified`, icon: ShieldAlert, accent: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30", ring: "text-emerald-400", sparkData: totals, sparkColor: "#10b981" },
    { key: "critical", label: "Critical Severity", value: String(stats?.criticalCount ?? 0), sub: `${stats?.highCount ?? 0} high · ${stats?.mediumCount ?? 0} med`, icon: Flame, accent: "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/30", ring: "text-rose-400", sparkData: criticalTrend, sparkColor: "#f43f5e" },
    { key: "sources", label: "Dark-Web Sources", value: String(stats?.darkWebSourcesCount ?? 0), sub: `${stats?.sourcesCount ?? 0} total sources`, icon: Radar, accent: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 border-fuchsia-500/30", ring: "text-fuchsia-400", sparkData: highTrend, sparkColor: "#d946ef" },
    { key: "fp", label: "FP Rejection Rate", value: `${stats?.falsePositiveRate ?? 0}%`, sub: `${stats?.totalRejected ?? 0} of ${stats?.totalScraped ?? 0} rejected`, icon: FilterX, accent: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30", ring: "text-amber-400", sparkData: lowTrend.length > 0 ? lowTrend : baseline, sparkColor: "#f59e0b" },
    { key: "verified", label: "AI Coverage", value: "100%", sub: "every item classified", icon: Activity, accent: "from-teal-500/20 to-teal-500/5 text-teal-300 border-teal-500/30", ring: "text-teal-400", sparkData: baseline, sparkColor: "#14b8a6" },
    { key: "shield", label: "ATM Coverage", value: String(stats?.byTactic.length ?? 0), sub: "tactics mapped", icon: ShieldCheck, accent: "from-cyan-500/20 to-cyan-500/5 text-cyan-300 border-cyan-500/30", ring: "text-cyan-400", sparkData: baseline, sparkColor: "#06b6d4" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((it, i) => (
        <motion.div key={it.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: loading ? 0.5 : 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
          <Card className={`relative flex h-full flex-col overflow-hidden border bg-gradient-to-br ${it.accent} backdrop-blur-sm transition-colors duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5`}>
            <div className="flex items-start justify-between gap-2 p-4 pb-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{it.label}</p>
                <p className="mt-1.5 font-mono text-2xl font-bold leading-none tabular-nums">{it.value}</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950/40"><it.icon className={`h-4 w-4 ${it.ring}`} /></div>
            </div>
            <p className="px-4 pb-2 truncate text-[11px] text-muted-foreground">{it.sub}</p>
            <div className="mt-auto px-4 pb-3 pt-1 opacity-90"><Sparkline data={it.sparkData} color={it.sparkColor} /></div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

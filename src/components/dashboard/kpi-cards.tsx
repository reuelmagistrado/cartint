"use client";

import { motion } from "framer-motion";
import { ShieldAlert, Flame, ShieldCheck, Radar, FilterX, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Stats } from "./types";

// Mini inline sparkline — pure SVG, no recharts overhead. Renders the per-day
// count for a given severity (or total) as a smooth area+line.
function Sparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  if (data.length === 0) return null;
  const w = 64;
  const h = 20;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 2) - 1;
    return [x, y] as const;
  });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.5} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={1.6} fill={color} />
      )}
    </svg>
  );
}

export function KpiCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const trend = stats?.trend ?? [];
  const totals = trend.map((t) => t.critical + t.high + t.medium + t.low);
  const criticalTrend = trend.map((t) => t.critical);
  const highTrend = trend.map((t) => t.high);

  const items = [
    {
      key: "total",
      label: "Active Automotive Threats",
      value: stats?.totalThreats ?? 0,
      sub: `${stats?.verifiedCount ?? 0} verified`,
      icon: ShieldAlert,
      accent: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
      ring: "text-emerald-400",
      sparkData: totals,
      sparkColor: "#10b981",
    },
    {
      key: "critical",
      label: "Critical Severity",
      value: stats?.criticalCount ?? 0,
      sub: `${stats?.highCount ?? 0} high / ${stats?.mediumCount ?? 0} medium`,
      icon: Flame,
      accent: "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/30",
      ring: "text-rose-400",
      sparkData: criticalTrend,
      sparkColor: "#f43f5e",
    },
    {
      key: "sources",
      label: "Dark-Web Sources Active",
      value: stats?.darkWebSourcesCount ?? 0,
      sub: `${stats?.sourcesCount ?? 0} total OSINT sources`,
      icon: Radar,
      accent: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 border-fuchsia-500/30",
      ring: "text-fuchsia-400",
      sparkData: highTrend,
      sparkColor: "#d946ef",
    },
    {
      key: "fp",
      label: "False-Positive Rejection Rate",
      value: `${stats?.falsePositiveRate ?? 0}%`,
      sub: `${stats?.totalRejected ?? 0} of ${stats?.totalScraped ?? 0} scraped rejected`,
      icon: FilterX,
      accent: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30",
      ring: "text-amber-400",
      sparkData: [],
      sparkColor: "#f59e0b",
    },
    {
      key: "verified",
      label: "LLM Classification Coverage",
      value: "100%",
      sub: "every item classified before display",
      icon: Activity,
      accent: "from-teal-500/20 to-teal-500/5 text-teal-300 border-teal-500/30",
      ring: "text-teal-400",
      sparkData: [],
      sparkColor: "#14b8a6",
    },
    {
      key: "shield",
      label: "Auto-ISAC ATM Coverage",
      value: stats?.byTactic.length ?? 0,
      sub: "tactics mapped",
      icon: ShieldCheck,
      accent: "from-cyan-500/20 to-cyan-500/5 text-cyan-300 border-cyan-500/30",
      ring: "text-cyan-400",
      sparkData: [],
      sparkColor: "#06b6d4",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((it, i) => (
        <motion.div
          key={it.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: loading ? 0.5 : 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <Card className={`relative overflow-hidden border bg-gradient-to-br ${it.accent} backdrop-blur-sm transition-colors duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5`}>
            <div className="flex items-start justify-between p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold leading-none">{it.value}</p>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">{it.sub}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <it.icon className={`h-5 w-5 ${it.ring}`} />
                {it.sparkData.length > 0 && (
                  <div className="mt-1 opacity-80">
                    <Sparkline data={it.sparkData} color={it.sparkColor} />
                  </div>
                )}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

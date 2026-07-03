"use client";

import { motion } from "framer-motion";
import { ShieldAlert, Flame, ShieldCheck, Radar, FilterX, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Stats } from "./types";

export function KpiCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const items = [
    {
      key: "total",
      label: "Active Automotive Threats",
      value: stats?.totalThreats ?? 0,
      sub: `${stats?.verifiedCount ?? 0} verified`,
      icon: ShieldAlert,
      accent: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
      ring: "text-emerald-400",
    },
    {
      key: "critical",
      label: "Critical Severity",
      value: stats?.criticalCount ?? 0,
      sub: `${stats?.highCount ?? 0} high / ${stats?.mediumCount ?? 0} medium`,
      icon: Flame,
      accent: "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/30",
      ring: "text-rose-400",
    },
    {
      key: "sources",
      label: "Dark-Web Sources Active",
      value: stats?.darkWebSourcesCount ?? 0,
      sub: `${stats?.sourcesCount ?? 0} total OSINT sources`,
      icon: Radar,
      accent: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 border-fuchsia-500/30",
      ring: "text-fuchsia-400",
    },
    {
      key: "fp",
      label: "False-Positive Rejection Rate",
      value: `${stats?.falsePositiveRate ?? 0}%`,
      sub: `${stats?.totalRejected ?? 0} of ${stats?.totalScraped ?? 0} scraped rejected`,
      icon: FilterX,
      accent: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30",
      ring: "text-amber-400",
    },
    {
      key: "verified",
      label: "LLM Classification Coverage",
      value: "100%",
      sub: "every item classified before display",
      icon: Activity,
      accent: "from-teal-500/20 to-teal-500/5 text-teal-300 border-teal-500/30",
      ring: "text-teal-400",
    },
    {
      key: "shield",
      label: "Auto-ISAC ATM Coverage",
      value: stats?.byTactic.length ?? 0,
      sub: "tactics mapped",
      icon: ShieldCheck,
      accent: "from-cyan-500/20 to-cyan-500/5 text-cyan-300 border-cyan-500/30",
      ring: "text-cyan-400",
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
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold leading-none">{it.value}</p>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">{it.sub}</p>
              </div>
              <it.icon className={`h-5 w-5 shrink-0 ${it.ring}`} />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

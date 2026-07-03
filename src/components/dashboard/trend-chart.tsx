"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { Stats } from "./types";

const fmtDay = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function TrendChart({ stats }: { stats: Stats | null }) {
  const data = (stats?.trend ?? []).map((t) => ({
    date: fmtDay(t.date),
    critical: t.critical,
    high: t.high,
    medium: t.medium,
    low: t.low,
  }));

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Threats Over Time</h3>
          <p className="text-[11px] text-slate-400">Accepted automotive threats — last 14 days, by severity</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Critical</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />High</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" />Medium</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Low</span>
        </div>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gMed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#facc15" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#facc15" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Legend wrapperStyle={{ display: "none" }} />
            <Area type="monotone" dataKey="critical" stackId="1" stroke="#f43f5e" strokeWidth={2} fill="url(#gCrit)" />
            <Area type="monotone" dataKey="high" stackId="1" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gHigh)" />
            <Area type="monotone" dataKey="medium" stackId="1" stroke="#facc15" strokeWidth={1.5} fill="url(#gMed)" />
            <Area type="monotone" dataKey="low" stackId="1" stroke="#10b981" strokeWidth={1.5} fill="url(#gLow)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

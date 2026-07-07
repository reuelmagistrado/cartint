"use client";

import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ShieldAlert } from "lucide-react";
import type { Stats } from "./types";

// Compact severity-distribution donut chart for at-a-glance severity posture.
// Renders the critical/high/medium/low split with a center total.
export function SeverityDonut({ stats, className = "" }: { stats: Stats | null; className?: string }) {
  const c = stats?.criticalCount ?? 0;
  const h = stats?.highCount ?? 0;
  const m = stats?.mediumCount ?? 0;
  const l = stats?.lowCount ?? 0;
  const total = c + h + m + l;

  const data = [
    { name: "Critical", value: c, color: "#f43f5e" },
    { name: "High", value: h, color: "#f59e0b" },
    { name: "Medium", value: m, color: "#facc15" },
    { name: "Low", value: l, color: "#10b981" },
  ].filter((d) => d.value > 0);

  return (
    <Card className={`flex items-center gap-4 border-slate-700/60 bg-slate-900/40 p-4 ${className}`}>
      <div className="relative h-[110px] w-[110px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.length > 0 ? data : [{ name: "None", value: 1, color: "#1e293b" }]}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={50}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
            >
              {(data.length > 0 ? data : [{ color: "#1e293b" }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
              formatter={(value: number, name: string) => [`${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold leading-none text-slate-100">{total}</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-500">threats</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-400" /> Severity Distribution
        </h3>
        <div className="mt-2 space-y-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="text-slate-300">{d.name}</span>
              <span className="ml-auto font-mono text-slate-400">
                {d.value} <span className="text-slate-600">· {Math.round((d.value / total) * 100)}%</span>
              </span>
            </div>
          ))}
          {data.length === 0 && <p className="text-[11px] text-slate-500">No threats.</p>}
        </div>
      </div>
    </Card>
  );
}

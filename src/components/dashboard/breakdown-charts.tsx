"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { Stats } from "./types";

const PALETTE = ["#10b981", "#14b8a6", "#06b6d4", "#5eead4", "#8b5cf6", "#d946ef", "#f43f5e", "#f59e0b", "#facc15", "#84cc16"];

function MiniBar({
  title,
  subtitle,
  data,
  horizontal = true,
}: {
  title: string;
  subtitle: string;
  data: { name: string; count: number }[];
  horizontal?: boolean;
}) {
  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={!horizontal} vertical={horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: "#cbd5e1", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} tickLine={false} interval={0} angle={-25} textAnchor="end" height={56} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "#1e293b80" }}
              contentStyle={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Bar dataKey="count" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function BreakdownCharts({ stats }: { stats: Stats | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <MiniBar
        title="By Source"
        subtitle="Dark-web & OSINT sources surfacing accepted threats"
        data={stats?.bySource ?? []}
      />
      <MiniBar
        title="By Automotive Category"
        subtitle="OEM, supplier, charging, fleet, mobility, etc."
        data={stats?.byCategory ?? []}
      />
      <MiniBar
        title="By Threat Actor"
        subtitle="Top ransomware groups & dark-web vendors"
        data={stats?.byActor ?? []}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, TrendingDown, CheckCircle2, XCircle } from "lucide-react";

type TimelinePoint = {
  id: string;
  startedAt: string;
  sourceName: string;
  status: string;
  fetched: number;
  accepted: number;
  rejected: number;
  runRate: number;
  cumRate: number;
};

type ScrapeHistory = {
  timeline: TimelinePoint[];
  bySource: { name: string; fetched: number; accepted: number; rejected: number; runs: number; rate: number }[];
  totals: { runs: number; fetched: number; accepted: number; rejected: number; cumRate: number };
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
};

export function ScrapeHistoryChart() {
  const [data, setData] = useState<ScrapeHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/scrape-history")
        .then((r) => r.json())
        .then((json) => {
          if (!cancelled) setData(json);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const chartData = (data?.timeline ?? []).map((p) => ({
    time: fmtTime(p.startedAt),
    accepted: p.accepted,
    rejected: p.rejected,
    cumRate: p.cumRate,
    source: p.sourceName,
    status: p.status,
  }));

  const totals = data?.totals;

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <History className="h-4 w-4 text-amber-400" /> Scrape History & False-Positive Trend
          </h3>
          <p className="text-[11px] text-slate-400">
            Per-run accepted vs rejected (last {data?.timeline.length ?? 0} runs) · cumulative rejection rate
          </p>
        </div>
        {totals && (
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> {totals.accepted} accepted
            </span>
            <span className="flex items-center gap-1 text-rose-300">
              <XCircle className="h-3 w-3" /> {totals.rejected} rejected
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <TrendingDown className="h-3 w-3" /> {totals.cumRate}% cum. FP rate
            </span>
          </div>
        )}
      </div>

      <div className="h-[220px] w-full">
        {loading && chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-500">Loading scrape history…</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
            No scrape runs yet. Click “Refresh Feed” to start.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gRej" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "#f59e0b", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value: number, name: string) => {
                  if (name === "cumRate") return [`${value}%`, "cum. FP rate"];
                  if (name === "accepted") return [value, "accepted"];
                  if (name === "rejected") return [value, "rejected (FP)"];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ display: "none" }} />
              <Area yAxisId="left" type="monotone" dataKey="accepted" stackId="1" stroke="#10b981" strokeWidth={1.5} fill="url(#gAcc)" name="accepted" />
              <Area yAxisId="left" type="monotone" dataKey="rejected" stackId="1" stroke="#f43f5e" strokeWidth={1.5} fill="url(#gRej)" name="rejected" />
              <Line yAxisId="right" type="monotone" dataKey="cumRate" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2, fill: "#f59e0b" }} name="cumRate" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {data && data.bySource.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Per-source breakdown</p>
          <ScrollArea className="max-h-[120px]">
            <div className="space-y-1">
              {data.bySource.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[11px]">
                  <span className="w-32 shrink-0 truncate font-mono text-slate-300">{s.name}</span>
                  <span className="text-slate-500">{s.runs} runs</span>
                  <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-emerald-500" style={{ width: `${s.fetched > 0 ? (s.accepted / s.fetched) * 100 : 0}%` }} />
                    <div className="bg-rose-500" style={{ width: `${s.fetched > 0 ? (s.rejected / s.fetched) * 100 : 0}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-amber-300">{s.rate}%</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </Card>
  );
}

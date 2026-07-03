"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ServerCog, Radio, ShieldCheck, Activity, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";

type ServiceHealth = {
  name: string;
  status: "ok" | "down" | "degraded";
  url: string;
  port: number;
  uptime?: number;
  lastCheck: string;
  details?: Record<string, unknown>;
  error?: string;
};

type SystemStatus = {
  ok: boolean;
  status: string;
  services: ServiceHealth[];
  checkedAt: string;
};

const SERVICE_META: Record<string, { icon: typeof ServerCog; tone: string; label: string }> = {
  "Next.js Dashboard": { icon: ServerCog, tone: "text-emerald-400", label: "App + API" },
  "threat-feed-service": { icon: Radio, tone: "text-fuchsia-400", label: "WebSocket live-feed" },
  "watchdog-scheduler": { icon: ShieldCheck, tone: "text-cyan-400", label: "Health watchdog + scrape scheduler" },
};

function fmtUptime(seconds?: number): string {
  if (!seconds && seconds !== 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StatusIcon({ status }: { status: ServiceHealth["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

export function SystemStatusPanel() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/system-status")
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

  const allOk = data?.ok ?? false;

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Activity className="h-4 w-4 text-cyan-400" /> System Status
          </h3>
          <p className="text-[11px] text-slate-400">
            {data?.services.length ?? 0} services · checked {data ? fmtAgo(data.checkedAt) : "…"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`h-6 border px-2 text-[10px] font-bold uppercase ${
            allOk
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          <span className={`mr-1 h-1.5 w-1.5 rounded-full ${allOk ? "bg-emerald-500" : "bg-amber-500"}`} />
          {data?.status ?? "checking…"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {loading && !data
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-lg border border-slate-800 bg-slate-800/30" />
            ))
          : (data?.services ?? []).map((s, i) => {
              const meta = SERVICE_META[s.name] ?? { icon: ServerCog, tone: "text-slate-400", label: s.name };
              const Icon = meta.icon;
              return (
                <motion.div
                  key={s.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-lg border p-3 ${
                    s.status === "ok"
                      ? "border-slate-700/60 bg-slate-800/30"
                      : s.status === "degraded"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-rose-500/40 bg-rose-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
                      <span className="truncate text-[11px] font-semibold text-slate-100">{s.name}</span>
                    </div>
                    <StatusIcon status={s.status} />
                  </div>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{meta.label}</p>
                  <div className="mt-2 space-y-0.5 text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Port</span>
                      <span className="font-mono text-slate-300">:{s.port}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uptime</span>
                      <span className="font-mono text-slate-300">{fmtUptime(s.uptime)}</span>
                    </div>
                    {s.details && "clients" in s.details && (
                      <div className="flex justify-between">
                        <span>Clients</span>
                        <span className="font-mono text-slate-300">{String(s.details.clients)}</span>
                      </div>
                    )}
                    {s.details && "healthChecks" in s.details && (
                      <div className="flex justify-between">
                        <span>Checks</span>
                        <span className="font-mono text-slate-300">{String(s.details.healthChecks)}</span>
                      </div>
                    )}
                    {s.details && "scheduledScrapes" in s.details && (
                      <div className="flex justify-between">
                        <span>Scheduled</span>
                        <span className="font-mono text-amber-300">{String(s.details.scheduledScrapes)}</span>
                      </div>
                    )}
                    {s.details && "restarts" in s.details && Number(s.details.restarts) > 0 && (
                      <div className="flex justify-between">
                        <span>Restarts</span>
                        <span className="font-mono text-rose-300">{String(s.details.restarts)}</span>
                      </div>
                    )}
                    {s.details && "threats" in s.details && (
                      <div className="flex justify-between">
                        <span>Threats</span>
                        <span className="font-mono text-emerald-300">{String(s.details.threats)}</span>
                      </div>
                    )}
                  </div>
                  {s.error && (
                    <p className="mt-1.5 truncate rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-300" title={s.error}>
                      {s.error}
                    </p>
                  )}
                </motion.div>
              );
            })}
      </div>
    </Card>
  );
}

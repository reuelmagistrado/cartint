"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle, FilterX, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Stats } from "./types";
import { timeAgo } from "./types";

export function AuditPanel({ stats }: { stats: Stats | null }) {
  const logs = stats?.recentScrapes ?? [];
  return (
    <Card className="border-amber-500/20 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FilterX className="h-4 w-4 text-amber-400" /> False-Positive Audit Trail
          </h3>
          <p className="text-[11px] text-slate-400">
            Every scrape run logged — accepted (automotive) vs rejected (false positives)
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-amber-300">{stats?.falsePositiveRate ?? 0}%</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">rejection rate</p>
        </div>
      </div>
      <ScrollArea className="max-h-[280px] px-4">
        <div className="divide-y divide-slate-800/60">
          {logs.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-500">No scrape runs yet. Click “Scrape All” to begin.</p>
          )}
          {logs.map((log, i) => {
            const total = log.fetched || 0;
            const acceptedPct = total > 0 ? Math.round((log.accepted / total) * 100) : 0;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Clock className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="truncate font-mono text-xs font-semibold text-slate-200">{log.sourceName}</span>
                    <Badge
                      variant="outline"
                      className={`h-4 shrink-0 border px-1 text-[9px] ${
                        log.status === "ok"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : log.status === "error"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {log.status}
                    </Badge>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(log.startedAt)}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-slate-800/40 py-1">
                    <p className="font-mono text-sm font-bold text-slate-200">{log.fetched}</p>
                    <p className="text-[9px] uppercase tracking-wider text-slate-500">fetched</p>
                  </div>
                  <div className="rounded bg-emerald-500/10 py-1">
                    <p className="flex items-center justify-center gap-1 font-mono text-sm font-bold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {log.accepted}
                    </p>
                    <p className="text-[9px] uppercase tracking-wider text-emerald-400/70">accepted</p>
                  </div>
                  <div className="rounded bg-rose-500/10 py-1">
                    <p className="flex items-center justify-center gap-1 font-mono text-sm font-bold text-rose-300">
                      <XCircle className="h-3 w-3" />
                      {log.rejected}
                    </p>
                    <p className="text-[9px] uppercase tracking-wider text-rose-400/70">rejected (FP)</p>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full bg-emerald-500" style={{ width: `${acceptedPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400">{acceptedPct}% accepted</span>
                </div>
                {log.error && <p className="mt-1 text-[10px] text-rose-400">{log.error}</p>}
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}

"use client";

import { motion } from "framer-motion";
import { Globe, Skull, Wifi, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Radar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SourceInfo } from "./types";
import { sourceTypeMeta, timeAgo } from "./types";

export function SourcesPanel({
  sources,
  loading,
  onScrape,
  scraping,
}: {
  sources: SourceInfo[];
  loading: boolean;
  onScrape: (source?: string) => void;
  scraping: boolean | string;
}) {
  return (
    <Card className="flex flex-col border-slate-700/60 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Radar className="h-4 w-4 text-fuchsia-400" /> Intelligence Sources
          </h3>
          <p className="text-[11px] text-slate-400">
            {sources.filter((s) => s.isDarkWeb).length} dark-web · {sources.filter((s) => !s.isDarkWeb).length} OSINT
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onScrape()}
          disabled={scraping === true}
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scraping === true ? "animate-spin" : ""}`} />
          Scrape All
        </Button>
      </div>
      <ScrollArea className="max-h-[420px]">
        <div className="divide-y divide-slate-800/60">
          {sources.map((s, i) => {
            const meta = sourceTypeMeta(s.type);
            const StatusIcon =
              s.lastStatus === "ok" ? CheckCircle2 : s.lastStatus === "empty" ? AlertTriangle : s.lastStatus === "error" ? XCircle : Wifi;
            const statusTone =
              s.lastStatus === "ok"
                ? "text-emerald-400"
                : s.lastStatus === "error"
                  ? "text-rose-400"
                  : s.lastStatus === "empty"
                    ? "text-amber-400"
                    : "text-slate-400";
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: loading ? 0.5 : 1 }}
                transition={{ delay: i * 0.03 }}
                className="group p-3 transition-colors hover:bg-slate-800/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {s.isDarkWeb ? (
                        <Skull className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      )}
                      <span className="truncate font-mono text-xs font-semibold text-slate-100">{s.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{s.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`h-5 border px-1.5 text-[10px] ${meta.tone}`}>
                        {meta.label}
                      </Badge>
                      <span className={`flex items-center gap-1 text-[10px] ${statusTone}`}>
                        <StatusIcon className="h-3 w-3" />
                        {s.lastStatus ?? "pending"} · {timeAgo(s.lastFetchAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-sm font-bold text-slate-100">{s.threatCount}</span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">threats</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-slate-400 opacity-0 transition-opacity hover:bg-slate-700/40 hover:text-slate-100 group-hover:opacity-100"
                      onClick={() => onScrape(s.name)}
                      disabled={scraping === true || scraping === s.name}
                    >
                      {scraping === s.name ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Run"}
                    </Button>
                  </div>
                </div>
                {s.lastError && (
                  <p className="mt-1.5 line-clamp-1 rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
                    {s.lastError}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}

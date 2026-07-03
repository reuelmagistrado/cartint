"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings2, Save, Loader2, Skull, Globe, RotateCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SourceConfig = {
  id: string;
  name: string;
  enabled: boolean;
  scrapeIntervalMin: number;
  isDarkWeb: boolean;
};

const PRESET_INTERVALS = [0, 15, 30, 60, 180, 360];

export function ScrapeSchedulePanel() {
  const { toast } = useToast();
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [original, setOriginal] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/sources/config")
      .then((r) => r.json())
      .then((json) => {
        setSources(json.sources ?? []);
        setOriginal(json.sources ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(sources) !== JSON.stringify(original);

  const updateSource = (name: string, patch: Partial<SourceConfig>) => {
    setSources((prev) => prev.map((s) => (s.name === name ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sources/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: sources.map((s) => ({
            name: s.name,
            enabled: s.enabled,
            scrapeIntervalMin: s.scrapeIntervalMin,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      setOriginal([...sources]);
      toast({ title: "Scrape schedule saved", description: `${json.updated} source(s) updated.` });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = sources.filter((s) => s.enabled).length;
  const autoCount = sources.filter((s) => s.enabled && s.scrapeIntervalMin > 0).length;

  return (
    <Card className="flex flex-col border-slate-700/60 bg-slate-900/40">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Settings2 className="h-4 w-4 shrink-0 text-emerald-400" /> Scrape Schedule
          </h3>
          <p className="text-[11px] text-slate-400">
            {enabledCount} enabled · {autoCount} auto-scrape · {sources.length} total
          </p>
        </div>
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          className={`h-8 shrink-0 ${dirty ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25" : "border-slate-700 text-slate-500"}`}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>

      <ScrollArea className="max-h-[340px] px-4">
        <div className="divide-y divide-slate-800/60">
          {loading && sources.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-800/60" />
                </div>
              ))
            : sources.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {s.isDarkWeb ? (
                        <Skull className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      )}
                      <span className="truncate font-mono text-xs font-semibold text-slate-100">{s.name}</span>
                    </div>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => updateSource(s.name, { enabled: v })}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RotateCw className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Interval</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {PRESET_INTERVALS.map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => updateSource(s.name, { scrapeIntervalMin: min })}
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                            s.scrapeIntervalMin === min
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                              : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {min === 0 ? "Manual" : min < 60 ? `${min}m` : `${min / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!s.enabled && (
                    <p className="mt-1.5 text-[10px] text-rose-400/70">Disabled — excluded from scrapes</p>
                  )}
                  {s.enabled && s.scrapeIntervalMin > 0 && (
                    <p className="mt-1.5 text-[10px] text-emerald-400/70">
                      Auto-scrapes every {s.scrapeIntervalMin < 60 ? `${s.scrapeIntervalMin} min` : `${s.scrapeIntervalMin / 60} h`}
                    </p>
                  )}
                </motion.div>
              ))}
        </div>
      </ScrollArea>

      {dirty && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-300">
          Unsaved changes — click Save to apply.
        </div>
      )}
    </Card>
  );
}

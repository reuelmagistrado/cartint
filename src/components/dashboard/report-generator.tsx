"use client";

import { useState } from "react";
import { FileText, Sparkles, Loader2, FileDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Report } from "./types";
import { timeAgo } from "./types";

export function ReportGenerator({ reports, onRefresh }: { reports: Report[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [viewing, setViewing] = useState<Report | null>(null);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "last-30-days" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to generate report");
      toast({ title: "CTI report generated", description: json.report.title });
      onRefresh();
      setViewing(json.report as Report);
    } catch (e) {
      toast({ title: "Report generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="border-emerald-500/20 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileText className="h-4 w-4 text-emerald-400" /> CTI Report Generator
          </h3>
          <p className="text-[11px] text-slate-400">LLM-generated cyber-threat-intelligence briefings from the live feed</p>
        </div>
        <Button
          size="sm"
          onClick={generate}
          disabled={generating}
          className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Generating…" : "Generate Report"}
        </Button>
      </div>
      <ScrollArea className="max-h-[260px]">
        <div className="divide-y divide-slate-800/60">
          {reports.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-500">No reports yet. Generate one from the current threat feed.</p>
          )}
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setViewing(r)}
              className="flex w-full items-start justify-between gap-2 p-3 text-left transition-colors hover:bg-slate-800/30"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{r.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{r.summary}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge variant="outline" className="h-4 border-slate-600 px-1 text-[9px] text-slate-400">
                    {r.period}
                  </Badge>
                  <span className="text-[10px] text-slate-500">{timeAgo(r.generatedAt)}</span>
                </div>
              </div>
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            </button>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-slate-700 bg-slate-950 p-0">
          <DialogHeader className="border-b border-slate-800 p-5 pb-4">
            <DialogTitle className="text-base font-semibold text-slate-50">
              {viewing?.title}
            </DialogTitle>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <Badge variant="outline" className="h-4 border-slate-600 px-1 text-[9px]">
                {viewing?.period}
              </Badge>
              <span>generated {timeAgo(viewing?.generatedAt ?? null)}</span>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <article className="prose prose-invert prose-sm max-w-none p-5 prose-headings:text-slate-100 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-headings:font-semibold">
              {viewing?.content.split("\n").map((line, i) => {
                if (/^#{1,3}\s/.test(line)) {
                  const level = line.match(/^#+/)![0].length;
                  const text = line.replace(/^#+\s/, "");
                  const cls = "mt-4 mb-2 font-semibold text-emerald-200";
                  const sizeCls =
                    level === 1 ? "text-base" : level === 2 ? "text-sm" : "text-[13px]";
                  return (
                    <h4 key={i} className={`${cls} ${sizeCls}`}>
                      {text}
                    </h4>
                  );
                }
                if (line.trim() === "") return <div key={i} className="h-2" />;
                if (/^\s*[-*]\s/.test(line)) {
                  return <li key={i} className="ml-4 text-slate-300">{line.replace(/^\s*[-*]\s/, "")}</li>;
                }
                return <p key={i} className="text-slate-300">{line}</p>;
              })}
            </article>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

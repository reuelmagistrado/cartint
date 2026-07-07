"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Provider = "openai" | "anthropic" | "google" | "ollama" | "custom";

const PROVIDERS: { value: Provider; label: string; helpUrl: string; needsKey: boolean; defaultModel: string; defaultBaseUrl: string }[] = [
  { value: "openai", label: "OpenAI", helpUrl: "https://platform.openai.com/api-keys", needsKey: true, defaultModel: "gpt-4o", defaultBaseUrl: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic Claude", helpUrl: "https://console.anthropic.com/settings/keys", needsKey: true, defaultModel: "claude-sonnet-4-20250514", defaultBaseUrl: "https://api.anthropic.com/v1" },
  { value: "google", label: "Google Gemini", helpUrl: "https://aistudio.google.com/apikey", needsKey: true, defaultModel: "gemini-2.0-flash", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "ollama", label: "Ollama (local, free)", helpUrl: "https://ollama.com/download", needsKey: false, defaultModel: "llama3.2", defaultBaseUrl: "http://localhost:11434/v1" },
  { value: "custom", label: "OpenAI Compatible (custom)", helpUrl: "", needsKey: false, defaultModel: "", defaultBaseUrl: "" },
];

export function AiSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<Provider>("custom");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((r) => r.json())
      .then((data) => {
        setProvider(data.provider || "custom");
        setApiKeySet(data.apiKeySet || false);
        setApiKey("");
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        setConfigured(data.configured || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentProvider = PROVIDERS.find((p) => p.value === provider)!;

  const handleProviderChange = (v: string) => {
    const p = PROVIDERS.find((x) => x.value === v)!;
    setProvider(p.value);
    setBaseUrl(p.defaultBaseUrl);
    setModel(p.defaultModel);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { provider, baseUrl, model };
      // Only send apiKey if the user typed a new one
      if (apiKey) body.apiKey = apiKey;
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save");
      setConfigured(json.configured);
      setApiKeySet(!!apiKey);
      setApiKey("");
      toast({ title: "AI settings saved", description: json.message || `Provider: ${currentProvider.label}` });
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Settings2 className="h-4 w-4 text-emerald-400" /> AI Provider Settings
          </h3>
          <p className="text-[11px] text-slate-400">Choose your AI provider for classification, report generation, and IOC extraction</p>
        </div>
        {configured ? (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            <AlertCircle className="mr-1 h-3 w-3" /> Not configured
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading settings...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Provider selector */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Provider</label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="border-slate-700 bg-slate-900/60 text-xs text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-950">
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key */}
          {(currentProvider.needsKey || provider === "custom") && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                API Key {provider === "custom" && <span className="text-slate-500">(optional)</span>} {apiKeySet && <span className="text-emerald-400">(set — enter new to replace)</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeySet ? "••••••••" : `Enter your ${currentProvider.label} API key`}
                className="h-8 w-full rounded border border-slate-700 bg-slate-900/60 px-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                  This key is stored locally in <code>db/ai-settings.json</code> and only used to make API requests from this dashboard.
              </p>
              {currentProvider.helpUrl && (
                <a
                  href={currentProvider.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                >
                  Get an API key <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={currentProvider.defaultBaseUrl || "https://your-provider.com/v1"}
              className="h-8 w-full rounded border border-slate-700 bg-slate-900/60 px-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Model ID</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={currentProvider.defaultModel || "e.g. gpt-4o, llama3.2"}
              className="h-8 w-full rounded border border-slate-700 bg-slate-900/60 px-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          {/* Custom provider note */}
          {provider === "custom" && (
            <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2 text-[11px] text-cyan-300/80">
              Connect to any OpenAI-compatible API endpoint (Azure OpenAI, Together AI, Anyscale,
              vLLM, LM Studio, etc.). Use the AI server URL, not this dashboard URL. Examples:
              <code className="mx-1 text-emerald-300">http://localhost:1234/v1</code> for LM Studio or
              <code className="mx-1 text-emerald-300">http://localhost:11434/v1</code> for Ollama.
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>

          {/* Not configured warning */}
          <AnimatePresence>
            {!configured && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300"
              >
                <AlertCircle className="mr-1 inline h-3 w-3" />
                AI features disabled — using heuristic fallback. Enter your provider settings for full functionality.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

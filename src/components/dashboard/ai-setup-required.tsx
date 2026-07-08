"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, CheckCircle2, ExternalLink, Brain } from "lucide-react";
import { motion } from "framer-motion";

type Provider = "zai" | "openai" | "anthropic" | "google" | "ollama" | "custom";

const PROVIDERS: { value: Provider; label: string; helpUrl: string; needsKey: boolean; defaultModel: string; defaultBaseUrl: string }[] = [
  { value: "zai", label: "Z.AI (default)", helpUrl: "https://z.ai", needsKey: true, defaultModel: "", defaultBaseUrl: "" },
  { value: "openai", label: "OpenAI", helpUrl: "https://platform.openai.com/api-keys", needsKey: true, defaultModel: "gpt-4o", defaultBaseUrl: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic Claude", helpUrl: "https://console.anthropic.com/settings/keys", needsKey: true, defaultModel: "claude-sonnet-4-20250514", defaultBaseUrl: "https://api.anthropic.com/v1" },
  { value: "google", label: "Google Gemini", helpUrl: "https://aistudio.google.com/apikey", needsKey: true, defaultModel: "gemini-2.0-flash", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "ollama", label: "Ollama (local, free)", helpUrl: "https://ollama.com/download", needsKey: false, defaultModel: "llama3.2", defaultBaseUrl: "http://localhost:11434/v1" },
  { value: "custom", label: "OpenAI Compatible (custom)", helpUrl: "", needsKey: true, defaultModel: "", defaultBaseUrl: "" },
];

export function AiSetupRequired({ onConfigured }: { onConfigured: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<Provider>("zai");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((r) => r.json())
      .then((data) => {
        setProvider(data.provider || "zai");
        setApiKeySet(data.apiKeySet || false);
        setApiKey("");
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
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
      if (apiKey) body.apiKey = apiKey;
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save");
      setApiKeySet(!!apiKey);
      setApiKey("");
      toast({ title: "AI settings saved", description: json.message || `Provider: ${currentProvider.label}` });

      // Verify the AI is now configured
      setChecking(true);
      const verifyRes = await fetch("/api/ai-settings");
      const verifyData = await verifyRes.json();
      setChecking(false);
      if (verifyData.configured) {
        toast({ title: "AI configured!", description: "Loading dashboard..." });
        setTimeout(onConfigured, 500);
      } else {
        toast({
          title: "AI not fully configured",
          description: provider === "custom" ? "Custom provider needs both Base URL and API Key" : "Please enter your API key",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b12] p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="border-emerald-500/30 bg-slate-900/60 p-6">
          {/* Header */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
              <ShieldAlert className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">CARTINT Setup Required</h1>
              <p className="text-[11px] text-slate-400">Configure your AI provider to continue</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-300/90">
            <Brain className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">AI is required for CARTINT to function.</p>
              <p className="mt-1 text-amber-300/70">
                AI powers threat classification (false-positive gate), CTI report generation, IOC extraction,
                and ATM mapping. Choose one of 6 providers below — including free local options.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Provider selector */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI Provider</label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 text-sm text-slate-200">
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
              {currentProvider.needsKey && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    API Key {apiKeySet && <span className="text-emerald-400">(set — enter new to replace)</span>}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={apiKeySet ? "••••••••" : `Enter your ${currentProvider.label} API key`}
                    className="h-9 w-full rounded border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    This key is stored locally and only used to make API requests from this dashboard.
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
              {provider !== "zai" && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Base URL</label>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={currentProvider.defaultBaseUrl || "https://your-provider.com/v1"}
                    className="h-9 w-full rounded border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              )}

              {/* Model */}
              {provider !== "zai" && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Model ID</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={currentProvider.defaultModel || "e.g. gpt-4o, glm-4.6, llama3.2"}
                    className="h-9 w-full rounded border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              )}

              {/* Z.AI note */}
              {provider === "zai" && (
                <div className="rounded border border-slate-700/60 bg-slate-800/40 p-2.5 text-[11px] text-slate-400">
                  Z.AI uses a <code className="text-emerald-300">.z-ai-config</code> file in the project root or home directory.
                  Create it with: <code className="text-cyan-300">{`{"baseUrl":"https://api.z.ai/api/v1","apiKey":"your-key"}`}</code>
                  <br />
                  <a href="https://z.ai" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300">
                    Get a Z.AI API key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              )}

              {/* Custom provider note */}
              {provider === "custom" && (
                <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-[11px] text-cyan-300/80">
                  Connect to any OpenAI-compatible API endpoint (Azure OpenAI, Together AI, Anyscale,
                  vLLM, LM Studio, etc.). Enter the Base URL, your API key, and the model ID your
                  provider supports.
                </div>
              )}

              {/* Save button */}
              <Button
                onClick={save}
                disabled={saving || checking}
                className="w-full border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              >
                {saving || checking ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {checking ? "Verifying..." : "Saving..."}</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Save & Continue</>
                )}
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-4 text-center text-[10px] text-slate-600">
          CARTINT — Automotive Threat Intelligence · Your API key never leaves your machine
        </p>
      </motion.div>
    </div>
  );
}

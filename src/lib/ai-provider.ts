import fs from "fs";
import path from "path";

// Unified AI provider — supports OpenAI, Anthropic, Google, Ollama, and
// custom OpenAI-compatible endpoints.
//
// All AI calls in CARTINT (threat classifier, CTI report generator, IOC
// extractor, dark-web filter) go through this module instead of calling
// provider-specific SDKs. This lets users choose their preferred AI provider
// from the Settings panel without changing code or installing vendor SDKs.
//
// Provider config is stored in memory (loaded from .env / environment vars
// at startup, overridable at runtime via /api/ai-settings). On a fresh
// clone with no config, AI calls throw quickly and callers fall back to
// heuristic/template modes.

export type AIProvider = "openai" | "anthropic" | "google" | "ollama" | "custom";

export type AISettings = {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string; // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
  model: string; // e.g. "gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash", "llama3.2"
};

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "ollama", "custom"] as const;

function normalizeProvider(provider: string | undefined): AIProvider {
  return SUPPORTED_PROVIDERS.includes(provider as AIProvider) ? (provider as AIProvider) : "custom";
}

const SETTINGS_PATH = path.join(process.cwd(), "db", "ai-settings.json");

// Default settings — derived from environment variables at startup.
// This way users can configure via .env OR via the Settings UI at runtime.
const DEFAULT_SETTINGS: AISettings = {
  provider: normalizeProvider(process.env.AI_PROVIDER),
  apiKey: process.env.AI_API_KEY || "",
  baseUrl: process.env.AI_BASE_URL || "",
  model: process.env.AI_MODEL || "",
};

function loadPersistedSettings(): AISettings | null {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<AISettings>;
    return {
      provider: normalizeProvider(raw.provider),
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "",
      model: typeof raw.model === "string" ? raw.model : "",
    };
  } catch (e) {
    console.warn("[ai-provider] Failed to load persisted AI settings:", e);
    return null;
  }
}

function persistSettings(s: AISettings): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
  } catch (e) {
    console.warn("[ai-provider] Failed to persist AI settings:", e);
  }
}

// In-memory settings (overridable at runtime via /api/ai-settings).
// On a fresh clone with no env vars this remains unconfigured; callers fall
// back to heuristic/template modes.
let settings: AISettings = loadPersistedSettings() ?? { ...DEFAULT_SETTINGS };

// In-memory runtime override (set via /api/ai-settings POST).
// When null, we use the env-derived defaults.
let runtimeOverride: AISettings | null = null;

export function getAISettings(): AISettings {
  return runtimeOverride ?? settings;
}

export function setAISettings(s: AISettings): void {
  runtimeOverride = { ...s };
  settings = { ...s };
  persistSettings(settings);
  // Reset the cached client so the next call creates a new one with the
  // updated config.
  cachedClient = null;
}

export function isAIConfigured(): boolean {
  const s = getAISettings();
  // Providers need an API key (or for Ollama, just a baseUrl)
  if (s.provider === "ollama") {
    return !!s.baseUrl;
  }
  if (s.provider === "custom") {
    // Custom local endpoints such as LM Studio/vLLM may not require an API key.
    return !!s.baseUrl && !!s.model;
  }
  return !!s.apiKey;
}

// Provider-specific defaults
export const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string; label: string; needsKey: boolean; helpUrl: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    label: "OpenAI",
    needsKey: true,
    helpUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    label: "Anthropic Claude",
    needsKey: true,
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    label: "Google Gemini",
    needsKey: true,
    helpUrl: "https://aistudio.google.com/apikey",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    label: "Ollama (local, free)",
    needsKey: false,
    helpUrl: "https://ollama.com/download",
  },
  custom: {
    baseUrl: "",
    model: "",
    label: "OpenAI Compatible (custom)",
    needsKey: true,
    helpUrl: "",
  },
};

// ---- Unified chat completion client ----

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  stream?: boolean;
  thinking?: { type: "enabled" | "disabled" };
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type ChatCompletionResult = {
  content: string;
  // For streaming: a ReadableStream of SSE deltas (same format as OpenAI)
  stream?: ReadableStream<Uint8Array>;
};

// Cached clients
let cachedClient: { settings: AISettings; call: (opts: ChatCompletionOptions) => Promise<ChatCompletionResult> } | null = null;

// Get the active AI client (creates/refreshes on settings change)
async function getClient() {
  const s = getAISettings();
  if (cachedClient && cachedClient.settings === s) return cachedClient;

  const client = { settings: s, call: createCaller(s) };
  cachedClient = client;
  return client;
}

// Create a caller function for the configured provider
function createCaller(s: AISettings): (opts: ChatCompletionOptions) => Promise<ChatCompletionResult> {
  switch (s.provider) {
    case "openai":
    case "anthropic":
    case "google":
    case "ollama":
    case "custom":
      return createOpenAiCompatibleCaller(s);
    default:
      return createOpenAiCompatibleCaller(s);
  }
}

// OpenAI-compatible caller — works for OpenAI, Anthropic (via openai compat),
// Google Gemini (via openai compat), and Ollama (openai compat).
// All four expose an OpenAI-compatible /chat/completions endpoint.
function createOpenAiCompatibleCaller(s: AISettings): (opts: ChatCompletionOptions) => Promise<ChatCompletionResult> {
  const baseUrl = s.baseUrl || PROVIDER_DEFAULTS[s.provider].baseUrl;
  const model = s.model || PROVIDER_DEFAULTS[s.provider].model;

  if (!baseUrl || !model) {
    return async () => {
      throw new Error("AI provider is not configured. Set AI_PROVIDER, AI_BASE_URL, AI_MODEL, and AI_API_KEY, or use Ollama/local fallback settings.");
    };
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (s.apiKey) {
    headers["Authorization"] = `Bearer ${s.apiKey}`;
  }
  // Anthropic requires an additional header
  if (s.provider === "anthropic") {
    headers["anthropic-version"] = "2023-06-01";
  }

  return async (opts: ChatCompletionOptions) => {
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      stream: opts.stream ?? false,
      ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`AI provider (${s.provider}) returned ${res.status}: ${errText.slice(0, 200)}`);
    }

    if (opts.stream && res.body) {
      return { content: "", stream: res.body as ReadableStream<Uint8Array> };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { content: json.choices?.[0]?.message?.content ?? "" };
  };
}

// ---- Public API: the single entry point all CARTINT code uses ----

/**
 * Create a chat completion using the configured AI provider.
 * Falls back gracefully — if the provider isn't configured or errors,
 * the caller should handle the error (e.g., use heuristic classification
 * or template report generation).
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const client = await getClient();
  return client.call(opts);
}

/**
 * Same as chatCompletion but returns just the content string (non-streaming).
 * Convenience wrapper for the common case.
 */
export async function chatCompletionText(opts: Omit<ChatCompletionOptions, "stream">): Promise<string> {
  const result = await chatCompletion({ ...opts, stream: false });
  return result.content;
}

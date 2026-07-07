import { NextRequest, NextResponse } from "next/server";
import {
  getAISettings,
  setAISettings,
  isAIConfigured,
  PROVIDER_DEFAULTS,
  type AIProvider,
} from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

// GET /api/ai-settings — returns the current AI provider config (API key masked)
export async function GET() {
  const s = getAISettings();
  return NextResponse.json({
    ok: true,
    provider: s.provider,
    // Mask the API key — never return the full key to the client
    apiKey: s.apiKey ? `${s.apiKey.slice(0, 4)}••••${s.apiKey.slice(-4)}` : "",
    apiKeySet: !!s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    configured: isAIConfigured(),
    defaults: PROVIDER_DEFAULTS,
  });
}

// POST /api/ai-settings — updates the AI provider config at runtime
// Body: { provider, apiKey?, baseUrl?, model? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const provider = (body.provider as AIProvider) || "custom";

    if (!PROVIDER_DEFAULTS[provider]) {
      return NextResponse.json(
        { ok: false, error: `Unknown provider: ${provider}` },
        { status: 400 },
      );
    }

    const defaults = PROVIDER_DEFAULTS[provider];
    const current = getAISettings();
    const incomingApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : undefined;
    const keepExistingApiKey = current.provider === provider && !incomingApiKey;
    const newSettings = {
      provider,
      apiKey: incomingApiKey || (keepExistingApiKey ? current.apiKey : ""),
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl.trim() : defaults.baseUrl,
      model: body.model || defaults.model,
    };

    if (newSettings.baseUrl) {
      let parsed: URL;
      try {
        parsed = new URL(newSettings.baseUrl);
      } catch {
        return NextResponse.json(
          { ok: false, error: "Base URL must be a full URL, for example http://localhost:1234/v1" },
          { status: 400 },
        );
      }

      const dashboardUrl = new URL(req.url);
      if (parsed.origin === dashboardUrl.origin) {
        return NextResponse.json(
          { ok: false, error: "Base URL points to this CARTINT dashboard. Enter your AI server URL instead, such as http://localhost:1234/v1 for LM Studio or http://localhost:11434/v1 for Ollama." },
          { status: 400 },
        );
      }
    }

    setAISettings(newSettings);

    return NextResponse.json({
      ok: true,
      provider: newSettings.provider,
      configured: isAIConfigured(),
      message: `AI provider set to ${defaults.label}`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

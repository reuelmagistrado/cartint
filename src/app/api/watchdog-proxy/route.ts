import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/watchdog-proxy — server-side proxy to the watchdog-scheduler
// mini-service (port 3004) so the client can read its health without dealing
// with the XTransformPort query param. Returns 502 if the mini-service is down.
export async function GET() {
  try {
    const res = await fetch("http://localhost:3004/health", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `watchdog returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, healthChecks: 0, healthFails: 0, restarts: 0, scheduledScrapes: 0 },
      { status: 502 },
    );
  }
}

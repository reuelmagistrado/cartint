"use client";

import { useEffect, useState } from "react";

export type WatchdogStatus = {
  ok: boolean;
  healthChecks: number;
  healthFails: number;
  lastHealthOk: string | null;
  restarts: number;
  lastRestart: string | null;
  scheduledScrapes: number;
  lastScheduledScrape: string | null;
  uptime: number;
};

// Polls the watchdog-scheduler mini-service (port 3004 via Caddy) for health.
// Used by the dashboard header to show scheduler/watchdog status.
export function useWatchdogStatus(enabled = true) {
  const [status, setStatus] = useState<WatchdogStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = () => {
      fetch("/api/watchdog-proxy")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!cancelled && json) setStatus(json);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  return status;
}

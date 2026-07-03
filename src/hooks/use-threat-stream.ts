"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export type ThreatStreamEvent = {
  type: "scrape:all" | "scrape:single";
  source?: string;
  results?: Array<{
    source: string;
    status: string;
    fetched: number;
    accepted: number;
    rejected: number;
    error?: string;
    durationMs: number;
  }>;
  totalAccepted: number;
  totalRejected: number;
  timestamp: string;
  clients: number;
};

export type ConnectionState = "connecting" | "connected" | "disconnected";

// Connects to the CARTINT threat-feed WebSocket mini-service (port 3003).
// Exposes connection state + the most recent "threats:new" event so the
// dashboard can show live toasts and auto-refresh the feed when scrapes
// complete.
//
// All setState calls happen inside socket event handlers (async callbacks),
// never synchronously in the effect body — the correct pattern for syncing
// React state to an external WebSocket connection.
export function useThreatStream() {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [lastEvent, setLastEvent] = useState<ThreatStreamEvent | null>(null);
  const [events, setEvents] = useState<ThreatStreamEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!enabled) {
      const s = socketRef.current;
      if (s) {
        s.disconnect();
        socketRef.current = null;
      }
      // Defer the state update out of the synchronous effect body.
      queueMicrotask(() => setState("disconnected"));
      return;
    }

    const socket = io("/?XTransformPort=3003", {
      // Polling-only: the websocket upgrade through the Caddy gateway can stall
      // and leave the socket in a "connecting" limbo. Polling is plain HTTP and
      // routes reliably through Caddy's XTransformPort forwarding. For
      // infrequent scrape-completion notifications, polling latency is negligible.
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => setState("connected"));
    socket.on("disconnect", () => setState("disconnected"));
    socket.io.on("reconnect_attempt", () => setState("connecting"));

    socket.on("threats:new", (event: ThreatStreamEvent) => {
      setLastEvent(event);
      setEvents((prev) => [event, ...prev].slice(0, 20));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { state, lastEvent, events, enabled, setEnabled, clearEvents };
}

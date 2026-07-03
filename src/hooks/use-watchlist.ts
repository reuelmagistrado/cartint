"use client";

import { useCallback, useSyncExternalStore } from "react";

// Persistent threat watchlist stored in localStorage. Lets analysts star
// threats they want to track across sessions.
//
// Uses useSyncExternalStore for correct SSR hydration + cross-tab sync —
// the React 19 idiomatic way to read external mutable state.

const STORAGE_KEY = "cartint:watchlist";
const EMPTY = new Set<string>();

let cachedSnapshot: Set<string> | null = null;
let listeners = new Set<() => void>();

function readSet(): Set<string> {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Set<string> {
  // Cache the parsed set; invalidate on write.
  if (cachedSnapshot === null) cachedSnapshot = readSet();
  return cachedSnapshot;
}

function getServerSnapshot(): Set<string> {
  return EMPTY;
}

function writeStored(next: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // localStorage may be unavailable (private mode) — fail silently.
  }
  cachedSnapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedSnapshot = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWatchlist() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((id: string) => {
    const current = cachedSnapshot ?? readSet();
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeStored(next);
  }, []);

  const has = useCallback((id: string) => ids.has(id), [ids]);

  const clear = useCallback(() => {
    writeStored(new Set());
  }, []);

  return { ids, count: ids.size, toggle, has, clear, hydrated: true };
}

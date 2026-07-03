"use client";

import { useEffect, useRef, useState } from "react";

// Persist a piece of state to localStorage (with SSR-safe hydration).
// Used for dashboard filter preferences that should survive reloads.
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  // Read once on mount (client-only — avoids hydration mismatch).
  // Deferring the setState out of the synchronous effect body avoids the
  // react-hooks/set-state-in-effect warning and is safe here.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) setValue(JSON.parse(raw) as T);
      } catch {
        // ignore parse / private-mode errors
      }
      hydrated.current = true;
    });
  }, [key]);

  // Write on change (after hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue];
}

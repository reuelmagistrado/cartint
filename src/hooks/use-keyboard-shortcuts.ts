"use client";

import { useEffect, useCallback } from "react";

type ShortcutHandler = (e: KeyboardEvent) => void;

export type ShortcutDef = {
  key: string; // single char or key name, e.g. "/" or "r" or "Escape"
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: ShortcutHandler;
  // If true (default), the shortcut is suppressed when typing in an input/textarea/select.
  allowInInput?: boolean;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  const stableRef = useCallback((e: KeyboardEvent) => {
    for (const s of shortcuts) {
      const keyMatches = e.key.toLowerCase() === s.key.toLowerCase();
      if (!keyMatches) continue;
      if (!!s.ctrl !== (e.ctrlKey || e.metaKey && false)) {
        // treat ctrl OR meta as the "ctrl" modifier for cross-platform convenience
        if (s.ctrl && !(e.ctrlKey || e.metaKey)) continue;
        if (!s.ctrl && (e.ctrlKey || e.metaKey)) continue;
      }
      if (!!s.shift !== e.shiftKey) continue;
      if (!!s.alt !== e.altKey) continue;
      if (!s.allowInInput && isTypingTarget(e.target)) {
        // Allow Escape to fire even from inputs (to close dialogs).
        if (e.key !== "Escape") continue;
      }
      s.handler(e);
      e.preventDefault();
      return;
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener("keydown", stableRef);
    return () => window.removeEventListener("keydown", stableRef);
  }, [stableRef]);
}

export const SHORTCUT_HELP: { key: string; description: string }[] = [
  { key: "/", description: "Focus threat search" },
  { key: "r", description: "Refresh feed (scrape all sources)" },
  { key: "f", description: "Toggle false-positive audit mode" },
  { key: "w", description: "Toggle watchlist filter" },
  { key: "Escape", description: "Close dialog / clear search" },
  { key: "?", description: "Show this shortcuts help" },
];

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The copy button on the install snippet (docs/project.md §6.9).
 *
 * It has the four states a screen should have (§13): idle, working, done and
 * failed. When the clipboard is not available it says so and leaves the
 * snippet selectable.
 */
type CopyState = "idle" | "copying" | "copied" | "error";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    setState("copying");

    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
      return;
    }

    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={copy}
        disabled={state === "copying"}
        className="rounded-card border border-border bg-surface-strong px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-60"
      >
        {state === "copying" ? "Copying…" : state === "copied" ? "Copied" : "Copy"}
      </button>

      <span role="status" aria-live="polite" className="text-xs text-muted">
        {state === "error"
          ? "Could not copy automatically — select the snippet above and copy it by hand."
          : null}
      </span>
    </div>
  );
}

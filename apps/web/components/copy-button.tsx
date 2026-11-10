"use client";

import { useEffect, useRef, useState } from "react";
import { StateMessage } from "./state-message";

/**
 * The copy button (docs/project.md §6.9).
 *
 * One button, two callers: the landing page and the install page.
 *
 * It has the states a screen should have (§13): idle, working, done and
 * failed. When the clipboard is not available it says so and leaves the
 * snippet selectable.
 */
type CopyState = "idle" | "copying" | "copied" | "error";

/**
 * The writer that puts the text on the clipboard.
 *
 * The writer is a parameter, so the copy path can be tested without a DOM:
 * the browser has no clipboard in node, and the button's own click is the one
 * line a DOM is needed for.
 */
export type ClipboardWriter = (text: string) => Promise<void>;

/**
 * Puts the text on the clipboard.
 *
 * A rejected write comes back as a rejection, and the button turns that into
 * its failed state.
 */
export async function copyText(text: string, write: ClipboardWriter): Promise<void> {
  await write(text);
}

/** The browser's own clipboard. */
function browserClipboard(): ClipboardWriter {
  return (text) => navigator.clipboard.writeText(text);
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    setState("copying");

    try {
      await copyText(text, browserClipboard());
      setState("copied");
    } catch {
      setState("error");
      return;
    }

    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
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
          {state === "copied" ? "The snippet is on your clipboard." : null}
        </span>
      </div>

      {state === "error" ? (
        <StateMessage
          tone="error"
          title="Could not copy automatically"
          description="Select the snippet above and copy it by hand."
        />
      ) : null}
    </div>
  );
}

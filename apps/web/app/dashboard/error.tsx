"use client";

import { useEffect } from "react";

/**
 * The error state for the dashboard (docs/project.md §13).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Something went wrong</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        The dashboard could not be loaded. Try again, and if it keeps failing we will look into it.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-card border border-border bg-surface-strong px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border"
      >
        Try again
      </button>
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * A translucent panel with the glass treatment from docs/project.md §13.
 *
 * Reads the shared tokens, so it is dark on the landing page and light on
 * the dashboard without any extra styling.
 */
export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 shadow-glass backdrop-blur-glass sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

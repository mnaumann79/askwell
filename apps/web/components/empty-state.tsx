import type { ReactNode } from "react";

/**
 * The empty state for a dashboard section that has nothing in it yet
 * (docs/project.md §13: every screen has an empty state).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action}
    </div>
  );
}

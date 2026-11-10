/**
 * The loading state for the dashboard (docs/project.md §13).
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-strong" />
      <div className="h-64 animate-pulse rounded-card border border-border bg-surface" />
    </div>
  );
}

/**
 * The empty, loading and error states (docs/project.md §13).
 *
 * Every screen needs all three. The demo on the landing page shows them, and
 * the copy button uses the error one when the clipboard is not available.
 */
export type StateTone = "empty" | "loading" | "error";

export function StateMessage({
  tone,
  title,
  description,
}: {
  tone: StateTone;
  title: string;
  description?: string;
}) {
  return (
    <div
      data-state={tone}
      role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
      className={`flex flex-col items-center gap-2 rounded-card border border-border px-4 py-6 text-center ${
        tone === "error" ? "bg-surface-strong" : "bg-surface"
      }`}
    >
      {tone === "loading" ? (
        <span aria-hidden className="flex items-center gap-1">
          <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted" />
          <span
            className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      ) : null}

      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

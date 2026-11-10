import { APP_NAME } from "@askwell/shared";

/**
 * The footer (docs/project.md §6.1).
 */
export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-4 py-10 text-center sm:px-6">
        <p className="text-sm font-semibold tracking-tight text-foreground">{APP_NAME}</p>
        <p className="text-xs text-muted">An AI support chat widget for any website.</p>
      </div>
    </footer>
  );
}

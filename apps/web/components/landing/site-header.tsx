import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

/**
 * The landing page header (docs/project.md §6.1, §13).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-glass">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="rounded-card px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-card border border-border bg-surface-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border"
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

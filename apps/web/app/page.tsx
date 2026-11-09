import { APP_NAME } from "@askwell/shared";

/**
 * Placeholder home page.
 *
 * The landing page itself arrives in Phase 1 (Lane B) and Phase 6. Until then
 * this page shows that the app builds, that the design tokens work and that the
 * app name comes from `@askwell/shared` (docs/project.md §5).
 */
export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(255_255_255_/_0.10),transparent_70%)]"
      />
      <section className="animate-enter relative w-full max-w-2xl rounded-card border border-border bg-surface p-10 text-center shadow-glass backdrop-blur-glass">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">AI support chat widget</p>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          {APP_NAME}
        </h1>
        <p className="mx-auto mt-6 max-w-md text-base text-muted">
          Add a support chat to any website. Your product information in, answers out.
        </p>
      </section>
    </main>
  );
}

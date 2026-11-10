import Link from "next/link";
import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import { PlanLimitList } from "./plan-limits";

/**
 * The hero (docs/project.md §6.1).
 *
 * The entrance animation is the `animate-enter` token from `globals.css`,
 * staggered by a short delay so the pieces arrive one after the other.
 */
export function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(255_255_255_/_0.10),transparent_70%)]"
      />
      <div className="relative flex flex-col items-center gap-6 text-center">
        <p className="animate-enter text-xs uppercase tracking-[0.3em] text-muted">
          AI support chat widget
        </p>

        <h1
          className="animate-enter max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Support answers, from your own product info.
        </h1>

        <p
          className="animate-enter max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          style={{ animationDelay: "160ms" }}
        >
          {APP_NAME} puts a chat widget on any website. Give it your product information — text or a
          PDF — and it answers visitors from it.
        </p>

        <div
          className="animate-enter flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <Link
            href="/sign-up"
            className="w-full rounded-card border border-border bg-surface-strong px-6 py-3 text-center text-sm font-semibold text-foreground shadow-glass backdrop-blur-glass transition-colors hover:bg-border sm:w-auto"
          >
            Start free
          </Link>
          <a
            href="#how-it-works"
            className="w-full rounded-card px-6 py-3 text-center text-sm font-medium text-muted transition-colors hover:text-foreground sm:w-auto"
          >
            See how it works
          </a>
        </div>

        <div
          className="animate-enter flex flex-col items-center gap-2 rounded-card border border-border bg-surface px-5 py-4"
          style={{ animationDelay: "320ms" }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Free plan</p>
          <PlanLimitList limits={PLAN_LIMITS.free} />
        </div>
      </div>
    </section>
  );
}

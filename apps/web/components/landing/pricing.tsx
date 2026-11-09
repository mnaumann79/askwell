import Link from "next/link";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { PlanLimitList } from "./plan-limits";
import { SectionHeading } from "./section-heading";

/**
 * The pricing section (docs/project.md §6.1, §5).
 *
 * Every number comes from `PLAN_LIMITS` in `@askwell/shared`, so the page
 * cannot drift from what the server actually allows.
 */
const PLANS: { id: Plan; name: string; lead: string; highlighted: boolean }[] = [
  {
    id: "free",
    name: "Free",
    lead: "For one site, to see how it works.",
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    lead: "For more sites, and more of everything.",
    highlighted: true,
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      className="scroll-reveal mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24"
    >
      <SectionHeading
        eyebrow="Pricing"
        title="Two plans"
        lead="Start on the free plan. Move up when you need more room."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-6 rounded-card border border-border p-6 shadow-glass backdrop-blur-glass sm:p-8 ${
              plan.highlighted ? "bg-surface-strong" : "bg-surface"
            }`}
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h3>
              <p className="text-sm leading-relaxed text-muted">{plan.lead}</p>
            </div>

            <PlanLimitList limits={PLAN_LIMITS[plan.id]} />

            <Link
              href="/sign-up"
              className="mt-auto rounded-card border border-border bg-surface-strong px-5 py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-border"
            >
              Start free
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

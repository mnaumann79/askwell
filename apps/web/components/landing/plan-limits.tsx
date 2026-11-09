import type { PlanLimits } from "@askwell/shared";

/**
 * The limits of one plan, as a list (docs/project.md §5).
 *
 * The numbers come from `PLAN_LIMITS` in `@askwell/shared`, so the page and
 * the server always agree on what a plan allows.
 */
export function PlanLimitList({ limits }: { limits: PlanLimits }) {
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted">
      <li>
        <span className="font-medium text-foreground">{limits.projects}</span>{" "}
        {limits.projects === 1 ? "project" : "projects"}
      </li>
      <li>
        <span className="font-medium text-foreground">
          {limits.messagesPerMonth.toLocaleString("en-US")}
        </span>{" "}
        messages a month, per project
      </li>
      <li>
        <span className="font-medium text-foreground">{limits.knowledgeSources}</span> knowledge
        sources, per project
      </li>
    </ul>
  );
}

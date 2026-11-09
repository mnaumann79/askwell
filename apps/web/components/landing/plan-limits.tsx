import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, type Plan, type PlanLimits } from "@askwell/shared";

/**
 * The plan comparison (docs/project.md §5).
 *
 * The limit rows come from `PLAN_LIMITS`, so the page and the server always
 * agree on what a plan allows. The customisation rows come from the free
 * plan's defaults in `@askwell/shared`, so the table cannot drift from what a
 * new project actually gets.
 */
export type PlanRow = {
  label: string;
  value: string;
};

const LIMIT_ROWS = [
  { label: "Projects", key: "projects" },
  { label: "Messages / month, per project", key: "messagesPerMonth" },
  { label: "Knowledge sources, per project", key: "knowledgeSources" },
] as const;

/** "bottom-right" → "Bottom right". */
function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());
}

function limitRows(limits: PlanLimits): PlanRow[] {
  return LIMIT_ROWS.map((row) => ({
    label: row.label,
    value:
      row.key === "messagesPerMonth"
        ? limits.messagesPerMonth.toLocaleString("en-US")
        : String(limits[row.key]),
  }));
}

const CUSTOMISATION: Record<Plan, PlanRow[]> = {
  free: [
    { label: "Button color", value: "Default" },
    { label: "Button position", value: titleCase(DEFAULT_WIDGET_CONFIG.position) },
    { label: "Button label", value: "Default" },
    { label: "Open animation", value: titleCase(DEFAULT_WIDGET_CONFIG.animation) },
    { label: "Header text", value: "Default" },
    { label: '"Powered by" badge', value: "Shown" },
  ],
  pro: [
    { label: "Button color", value: "Any" },
    { label: "Button position", value: "Any corner" },
    { label: "Button label", value: "Custom" },
    { label: "Open animation", value: "Fade, slide or scale" },
    { label: "Header text", value: "Custom" },
    { label: '"Powered by" badge', value: "Hidden" },
  ],
};

/** Every row of §5 for one plan. */
export function planRows(plan: Plan): PlanRow[] {
  const limits: PlanLimits = PLAN_LIMITS[plan];

  return [...limitRows(limits), ...CUSTOMISATION[plan]];
}

/**
 * The rows as a list of label and value pairs.
 */
export function PlanRows({ rows }: { rows: PlanRow[] }) {
  return (
    <dl className="flex w-full flex-col gap-2 text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
        >
          <dt className="text-muted">{row.label}</dt>
          <dd className="text-right font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The limits of one plan only, as a list (docs/project.md §5).
 */
export function PlanLimitList({ limits }: { limits: PlanLimits }) {
  return <PlanRows rows={limitRows(limits)} />;
}

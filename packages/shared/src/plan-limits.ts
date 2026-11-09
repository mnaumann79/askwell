/**
 * The two plans (docs/project.md §5).
 */
export type Plan = "free" | "pro";

export type PlanLimits = {
  /** Projects an owner may have. */
  projects: number;
  /** Accepted chat messages per project per month. */
  messagesPerMonth: number;
  /** Knowledge sources per project (uploaded files and pasted text together). */
  knowledgeSources: number;
};

/**
 * The plan limits, in one place.
 *
 * The server decides the plan, and the limits live here so the widget and the
 * dashboard never decide what is allowed. The Postgres functions that count
 * things (project creation, knowledge sources, messages) receive these values
 * from the server.
 */
export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
  },
} as const satisfies Record<Plan, PlanLimits>;

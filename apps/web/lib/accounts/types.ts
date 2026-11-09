/**
 * The account shape the dashboard reads.
 *
 * It mirrors the `accounts` table in docs/project.md §7: one row per Clerk
 * user, carrying the plan that decides what the owner may do.
 */
export type AccountPlan = "free" | "pro";

export type Account = {
  /** The Clerk user id. The primary key of the `accounts` table. */
  clerkUserId: string;
  plan: AccountPlan;
  /** ISO timestamp. */
  createdAt: string;
};

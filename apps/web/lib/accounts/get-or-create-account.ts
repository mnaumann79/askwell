import type { Account } from "./types";

/**
 * A fixed timestamp, so the mock account is the same on every call and the
 * tests do not depend on the clock.
 */
const MOCK_CREATED_AT = "1970-01-01T00:00:00.000Z";

/**
 * Returns the owner's account, creating it on first sign-in
 * (docs/project.md §6.2).
 *
 * MOCK. The real implementation lands in task P1F-T07, once Lane A's
 * `accounts` table exists. Until then this returns a fake account on the
 * `free` plan.
 *
 * The dashboard only ever calls this module — never the mock directly — so
 * P1F-T07 replaces this one file and nothing else.
 */
export async function getOrCreateAccount(clerkUserId: string): Promise<Account> {
  if (!clerkUserId) {
    throw new Error("getOrCreateAccount needs a Clerk user id");
  }

  return {
    clerkUserId,
    plan: "free",
    createdAt: MOCK_CREATED_AT,
  };
}

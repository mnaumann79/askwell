import { auth } from "@clerk/nextjs/server";
import { getOrCreateAccount } from "../../lib/accounts";
import { EmptyState } from "../../components/empty-state";
import { GlassPanel } from "../../components/glass-panel";
import { SIGN_IN_URL } from "../../lib/clerk/urls";

/**
 * The dashboard home (docs/project.md §6.2).
 *
 * Signing in for the first time creates the owner's `accounts` row. That
 * happens inside `getOrCreateAccount`, on the server, with the user id from
 * the Clerk session.
 */
export default async function DashboardPage() {
  const { userId } = await auth.protect({ unauthenticatedUrl: SIGN_IN_URL });
  const account = await getOrCreateAccount(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium capitalize text-muted">
          {`${account.plan} plan`}
        </span>
      </div>

      <GlassPanel>
        <EmptyState
          title="Nothing here yet"
          description="Your projects, the knowledge you add to them and the conversations they collect all show up here."
        />
      </GlassPanel>
    </div>
  );
}

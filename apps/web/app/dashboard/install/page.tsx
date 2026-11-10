import { auth } from "@clerk/nextjs/server";
import { getOrCreateAccount } from "../../../lib/accounts";
import { SIGN_IN_URL } from "../../../lib/clerk/urls";
import { InstallPanel } from "../../../components/install/install-panel";
import { InstallSteps } from "../../../components/install/install-steps";
import { PlanNote } from "../../../components/install/plan-note";

/**
 * The install page (docs/project.md §6.9).
 *
 * The script tag, a copy button and three steps. The owner's projects come from
 * the route that answers them; the route reads them through the owner client, so
 * RLS scopes them to the signed-in owner (§9).
 *
 * The plan is read here, on the server, and the note about the Pro parts is
 * rendered here — the browser never decides what the owner may do (§9).
 */
export default async function InstallPage() {
  const { userId } = await auth.protect({ unauthenticatedUrl: SIGN_IN_URL });
  const account = await getOrCreateAccount(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Install</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          One script tag puts the chat button on your site.
        </p>
      </div>

      <InstallPanel />

      <InstallSteps />

      <PlanNote plan={account.plan} />
    </div>
  );
}

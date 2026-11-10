import { auth } from "@clerk/nextjs/server";
import { PLAN_LIMITS } from "@askwell/shared";
import { getOrCreateAccount } from "../../../lib/accounts";
import { SIGN_IN_URL } from "../../../lib/clerk/urls";
import { ProjectsPanel } from "../../../components/projects/projects-panel";

/**
 * The projects page (docs/project.md §6.3).
 *
 * The owner's projects, with a create, a rename and a delete. The limit is read
 * here, on the server: the page shows what the owner has and what the plan
 * allows, and it never decides what is allowed itself (§9).
 */
export default async function ProjectsPage() {
  const { userId } = await auth.protect({ unauthenticatedUrl: SIGN_IN_URL });
  const account = await getOrCreateAccount(userId);
  const limit = PLAN_LIMITS[account.plan].projects;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          A project is one widget with its own public key. The script tag for it is on the install
          page.
        </p>
      </div>

      <ProjectsPanel limit={limit} />
    </div>
  );
}

import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, type Project } from "@askwell/shared";
import { getOrCreateAccount } from "../accounts";
import { createServiceClient } from "../supabase/service";
import { refusalFrom } from "./plan-refusal";
import { toProject } from "./types";

/**
 * Creates a project for the owner (docs/project.md §6.3).
 *
 * The plan is read on the server, from the owner's own account row, and the
 * limit comes from PLAN_LIMITS - never from the client (§9). The limit is
 * handed to `create_project`, whose own check under a row lock decides
 * whether the project may be created. The route does not count the owner's
 * projects itself: that would be a second copy of the limit, and the two
 * copies would drift.
 *
 * The call goes through the service client: `create_project` is granted to
 * `service_role` only, and `authenticated` has no INSERT on `projects` (§7).
 * The route has checked the session before it gets here, and the function
 * only writes for the owner id it is given.
 */
export async function createProject(ownerId: string, name: string): Promise<Project> {
  const account = await getOrCreateAccount(ownerId);
  const limit = PLAN_LIMITS[account.plan].projects;

  const { data, error } = await createServiceClient().rpc("create_project", {
    p_owner_id: ownerId,
    p_name: name,
    p_max_projects: limit,
    p_widget_config: DEFAULT_WIDGET_CONFIG,
  });

  if (error) {
    throw refusalFrom(error);
  }

  return toProject(data);
}

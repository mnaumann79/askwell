import type { Project } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";
import { PROJECT_COLUMNS, toProject } from "./types";

/**
 * The owner's projects (docs/project.md §6.3).
 *
 * The read goes through the owner client, so RLS scopes it to the signed-in
 * owner: another owner's project is not reachable, and the route does not
 * filter by owner itself (§9). The route never gets the service client for a
 * read, because the service client skips RLS and would need a filter of its
 * own - the thing §9 forbids.
 */
export async function listProjects(): Promise<Project[]> {
  const client = await createOwnerClient();

  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not read the projects: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];

  return rows.map(toProject);
}

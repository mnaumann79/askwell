import type { Project } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";
import { PROJECT_COLUMNS, toProject } from "./types";

/**
 * Renames a project (docs/project.md §6.3).
 *
 * Only the name is sent: the column-level grant lets `authenticated` update
 * that column and no other, and the RLS policy limits the rows to the
 * owner's own projects. A project of another owner is not an error we
 * describe - it updates no row and the route answers 404, so the answer does
 * not leak that the project exists (§9).
 */
export async function renameProject(projectId: string, name: string): Promise<Project | null> {
  const client = await createOwnerClient();

  const { data, error } = await client
    .from("projects")
    .update({ name })
    .eq("id", projectId)
    .select(PROJECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not rename the project: ${error.message}`);
  }

  return data === null ? null : toProject(data);
}

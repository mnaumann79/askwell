import { createOwnerClient } from "../supabase/owner";

/**
 * Deletes a project (docs/project.md §6.3).
 *
 * The cascades take the widget config, the sources, the chunks, the
 * conversations and the messages of the project with it, so one delete is
 * enough.
 *
 * The delete goes through the owner client, so RLS limits it to the owner's
 * own projects. A project of another owner deletes no row and the route
 * answers 404 - the same answer as for a project that does not exist, so
 * nothing leaks (§9).
 */
export async function deleteProject(projectId: string): Promise<string | null> {
  const client = await createOwnerClient();

  const { data, error } = await client
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not delete the project: ${error.message}`);
  }

  if (data === null) {
    return null;
  }

  const id = (data as { id?: unknown }).id;

  if (typeof id !== "string") {
    throw new Error("The deleted project row is not the shape we expect.");
  }

  return id;
}

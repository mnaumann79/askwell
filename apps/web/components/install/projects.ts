import { apiErrorSchema, projectListResponseSchema, type Project } from "@askwell/shared";

/**
 * The owner's projects (docs/project.md §6.3, §6.9).
 *
 * The page reads them from the route that answers them, and the route reads
 * them through the owner client, so RLS scopes them to the signed-in owner
 * (§9). Nothing here filters by owner: the page never sees another owner's
 * projects.
 *
 * The answer is parsed with the shared schema, so the page expects the shape
 * the contract names — not the shape the route happens to answer today.
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects", { headers: { accept: "application/json" } });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const body: unknown = await response.json();
  const parsed = projectListResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error("The projects came back in a shape we do not understand.");
  }

  return parsed.data.projects;
}

/** The message of an error answer, when the route carries one. */
async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);

  if (parsed.success) {
    return parsed.data.error.message;
  }

  return `The projects could not be read (HTTP ${response.status}).`;
}

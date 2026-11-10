import {
  apiErrorSchema,
  createProjectRequestSchema,
  deleteProjectResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  updateProjectRequestSchema,
  type DeleteProjectResponse,
  type ProjectListResponse,
  type ProjectResponse,
} from "@askwell/shared";

/**
 * The owner's projects, through the routes that answer them
 * (docs/project.md §6.3, §8).
 *
 * The routes read through the owner client, so RLS scopes them to the signed-in
 * owner (§9). The page never filters by owner itself and never reads project
 * data from the browser directly: it asks the route.
 *
 * The answers are parsed with the shared schemas, so the page expects the shape
 * the contract names — and a refusal comes back in the shared error shape, with
 * the plan limit among them.
 */
export type ProjectsResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string };

/** The shape of a schema this file parses an answer with. */
type Schema<T> = {
  safeParse: (body: unknown) => { success: true; data: T } | { success: false };
};

/** What the routes say when a name is not one. */
const INVALID_NAME = "A project needs a name of at most 100 characters.";

/**
 * Reads an answer: the parsed shape, or the refusal in the shared error shape.
 */
async function readAnswer<T>(response: Response, schema: Schema<T>): Promise<ProjectsResult<T>> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);

    if (parsed.success) {
      return { ok: false, code: parsed.data.error.code, message: parsed.data.error.message };
    }

    return {
      ok: false,
      code: "internal_error",
      message: `The request failed (HTTP ${response.status}).`,
    };
  }

  const body: unknown = await response.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      code: "internal_error",
      message: "The answer came back in a shape we do not understand.",
    };
  }

  return { ok: true, data: parsed.data };
}

/** `GET /api/projects` — the owner's own projects. */
export async function listProjects(): Promise<ProjectsResult<ProjectListResponse>> {
  const response = await fetch("/api/projects", { headers: { accept: "application/json" } });

  return readAnswer(response, projectListResponseSchema);
}

/** `POST /api/projects` — the server generates the public key and the config. */
export async function createProject(name: string): Promise<ProjectsResult<ProjectResponse>> {
  const parsed = createProjectRequestSchema.safeParse({ name });

  if (!parsed.success) {
    return { ok: false, code: "invalid_request", message: INVALID_NAME };
  }

  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  return readAnswer(response, projectResponseSchema);
}

/** `PATCH /api/projects/:id` — a project can only be renamed (§6.3). */
export async function renameProject(
  id: string,
  name: string,
): Promise<ProjectsResult<ProjectResponse>> {
  const parsed = updateProjectRequestSchema.safeParse({ name });

  if (!parsed.success) {
    return { ok: false, code: "invalid_request", message: INVALID_NAME };
  }

  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  return readAnswer(response, projectResponseSchema);
}

/** `DELETE /api/projects/:id` — the project and everything under it. */
export async function deleteProject(id: string): Promise<ProjectsResult<DeleteProjectResponse>> {
  const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });

  return readAnswer(response, deleteProjectResponseSchema);
}

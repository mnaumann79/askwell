import { updateProjectRequestSchema } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { errorResponse, internalErrorResponse } from "../../../../lib/projects/errors";
import { deleteProject, isProjectId, renameProject } from "../../../../lib/projects/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type RouteContext = { params: Promise<{ id: string }> };

/** `PATCH /api/projects/:id` — renames a project. */
export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to rename a project.");
  }

  const { id } = await params;

  if (!isProjectId(id)) {
    return errorResponse("not_found", "No such project.");
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProjectRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("invalid_request", "Give the project a name.");
  }

  try {
    // The owner client, so RLS decides whether this project is the owner's.
    const client = await createOwnerClient();
    const project = await renameProject(client, id, parsed.data.name);

    if (!project) {
      return errorResponse("not_found", "No such project.");
    }

    return Response.json({ project });
  } catch (error) {
    console.error("PATCH /api/projects/:id failed", error);
    return internalErrorResponse();
  }
}

/** `DELETE /api/projects/:id` — deletes a project. */
export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to delete a project.");
  }

  const { id } = await params;

  if (!isProjectId(id)) {
    return errorResponse("not_found", "No such project.");
  }

  try {
    // The owner client, so RLS decides whether this project is the owner's.
    const client = await createOwnerClient();
    const deleted = await deleteProject(client, id);

    if (!deleted) {
      return errorResponse("not_found", "No such project.");
    }

    return Response.json({ id });
  } catch (error) {
    console.error("DELETE /api/projects/:id failed", error);
    return internalErrorResponse();
  }
}

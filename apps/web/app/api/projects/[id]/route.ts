import { auth } from "@clerk/nextjs/server";
import {
  projectSchema,
  updateProjectRequestSchema,
  type DeleteProjectResponse,
  type ProjectResponse,
} from "@askwell/shared";
import {
  deleteProject,
  errorResponse,
  readJsonBody,
  renameProject,
} from "../../../../lib/projects";

/**
 * One project of the owner (docs/project.md §6.3, §8).
 *
 * A project of another owner is answered with 404 and not with 403: the
 * answer must not tell the caller that the project exists (§9).
 */

/** The id of the route has to be a project id. The contract says what one is. */
const projectIdSchema = projectSchema.shape.id;

const NOT_FOUND = "There is no such project.";

/** `PATCH /api/projects/:id` - renames a project. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to rename a project.");
  }

  const { id } = await params;

  if (!projectIdSchema.safeParse(id).success) {
    return errorResponse("not_found", NOT_FOUND);
  }

  const parsed = updateProjectRequestSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("invalid_request", "A project needs a name of at most 100 characters.");
  }

  try {
    const project = await renameProject(id, parsed.data.name);

    // No row means the project is not the owner's, or is not there at all.
    // The answer is the same either way.
    if (!project) {
      return errorResponse("not_found", NOT_FOUND);
    }

    const body: ProjectResponse = { project };

    return Response.json(body);
  } catch (error) {
    console.error("Could not rename the project", error);

    return errorResponse("internal_error", "Could not rename the project.");
  }
}

/** `DELETE /api/projects/:id` - deletes a project. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to delete a project.");
  }

  const { id } = await params;

  if (!projectIdSchema.safeParse(id).success) {
    return errorResponse("not_found", NOT_FOUND);
  }

  try {
    const deletedId = await deleteProject(id);

    if (!deletedId) {
      return errorResponse("not_found", NOT_FOUND);
    }

    const body: DeleteProjectResponse = { id: deletedId };

    return Response.json(body);
  } catch (error) {
    console.error("Could not delete the project", error);

    return errorResponse("internal_error", "Could not delete the project.");
  }
}

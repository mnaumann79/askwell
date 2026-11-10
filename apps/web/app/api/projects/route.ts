import { auth } from "@clerk/nextjs/server";
import {
  createProjectRequestSchema,
  type ProjectListResponse,
  type ProjectResponse,
} from "@askwell/shared";
import {
  createProject,
  errorResponse,
  listProjects,
  PlanRefusalError,
  readJsonBody,
} from "../../../lib/projects";

/**
 * The owner's projects (docs/project.md §6.3, §8).
 *
 * A session is required. An API answers with a status and not with a
 * redirect, so a request without a session gets 401 in the shared error
 * shape.
 */

/** `GET /api/projects` - the owner's own projects. */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to see your projects.");
  }

  try {
    const projects = await listProjects();
    const body: ProjectListResponse = { projects };

    return Response.json(body);
  } catch (error) {
    console.error("Could not list the projects", error);

    return errorResponse("internal_error", "Could not read your projects.");
  }
}

/** `POST /api/projects` - creates a project for the owner. */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to create a project.");
  }

  const parsed = createProjectRequestSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("invalid_request", "A project needs a name of at most 100 characters.");
  }

  try {
    const project = await createProject(userId, parsed.data.name);
    const body: ProjectResponse = { project };

    return Response.json(body, { status: 201 });
  } catch (error) {
    // The plan limit is the one refusal the route knows by name: the
    // function raised it and the hint says so.
    if (error instanceof PlanRefusalError) {
      return errorResponse(error.code, error.message);
    }

    console.error("Could not create the project", error);

    return errorResponse("internal_error", "Could not create the project.");
  }
}

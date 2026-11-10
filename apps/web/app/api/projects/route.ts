import { createProjectRequestSchema } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { errorResponse, internalErrorResponse } from "../../../lib/projects/errors";
import {
  createProject,
  getOwnerPlan,
  listProjects,
  ProjectsError,
} from "../../../lib/projects/projects";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";

/** `GET /api/projects` — the projects of the signed-in owner. */
export async function GET(): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to see your projects.");
  }

  try {
    // The owner client, so RLS scopes the read to the rows of this owner.
    const client = await createOwnerClient();
    const projects = await listProjects(client);

    return Response.json({ projects });
  } catch (error) {
    console.error("GET /api/projects failed", error);
    return internalErrorResponse();
  }
}

/** `POST /api/projects` — creates a project for the signed-in owner. */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to create a project.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("invalid_request", "Give the project a name.");
  }

  try {
    // The plan is read on the server, never taken from the request (§9).
    const ownerClient = await createOwnerClient();
    const plan = await getOwnerPlan(ownerClient, userId);

    // create_project may only be run by the server. The owner id comes from
    // the session, not from the request.
    const serviceClient = createServiceClient();
    const project = await createProject(serviceClient, userId, parsed.data.name, plan);

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectsError && error.code === "limit_reached") {
      // The plan does not allow another project (§6.3).
      return errorResponse("payment_required", error.message);
    }

    console.error("POST /api/projects failed", error);
    return internalErrorResponse();
  }
}

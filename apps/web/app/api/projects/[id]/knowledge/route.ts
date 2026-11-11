import { auth } from "@clerk/nextjs/server";
import {
  pasteKnowledgeRequestSchema,
  projectSchema,
  PLAN_LIMITS,
  type KnowledgeSourceResponse,
} from "@askwell/shared";
import { getOrCreateAccount } from "../../../../../lib/accounts";
import {
  getOwnedProject,
  processKnowledgeSource,
  reserveKnowledgeSource,
} from "../../../../../lib/knowledge/process";
import { errorResponse, PlanRefusalError, readJsonBody } from "../../../../../lib/projects";

/**
 * The knowledge sources of one project (docs/project.md §6.4, §8).
 *
 * `POST` pastes a text: the source is reserved, the text is split into
 * chunks, every chunk is embedded and the chunks are stored (the pipeline is
 * in `lib/knowledge/process.ts`).
 *
 * A session is required. An API answers with a status and not with a
 * redirect, so a request without a session gets 401 in the shared error
 * shape.
 *
 * The plan is read on the server, from the owner's own account row, and the
 * limit is `PLAN_LIMITS[plan].knowledgeSources` - never from the client
 * (§9). The counting is done by `reserve_knowledge_source`, which locks the
 * project row, so two requests cannot both pass the limit. At the limit the
 * route answers with its own refusal, the way the projects route answers
 * when the plan does not allow another project.
 */

/** The id of the route has to be a project id. The contract says what one is. */
const projectIdSchema = projectSchema.shape.id;

const NOT_FOUND = "There is no such project.";

/** `POST /api/projects/:id/knowledge` - pastes a text into the project. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("unauthorized", "Sign in to add a source.");
  }

  const { id } = await params;

  if (!projectIdSchema.safeParse(id).success) {
    return errorResponse("not_found", NOT_FOUND);
  }

  const parsed = pasteKnowledgeRequestSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("invalid_request", "A source needs a title and a text.");
  }

  try {
    // The project has to be the owner's own. The read goes through the owner
    // client, so RLS scopes it, and a project of another owner answers 404 -
    // the same answer as for a project that does not exist (§9).
    const owned = await getOwnedProject(id);

    if (!owned) {
      return errorResponse("not_found", NOT_FOUND);
    }

    // The plan is read on the server. The limit is the number of sources the
    // plan allows - files and pasted texts together (§6.4).
    const account = await getOrCreateAccount(userId);
    const limit = PLAN_LIMITS[account.plan].knowledgeSources;

    const source = await reserveKnowledgeSource({
      projectId: owned,
      title: parsed.data.title,
      maxSources: limit,
    });

    const processed = await processKnowledgeSource({
      projectId: owned,
      source,
      content: parsed.data.content,
    });

    const body: KnowledgeSourceResponse = { source: processed };

    return Response.json(body, { status: 201 });
  } catch (error) {
    // The plan limit is the one refusal the route knows by name: the
    // function raised it and the hint says so.
    if (error instanceof PlanRefusalError) {
      return errorResponse(error.code, error.message);
    }

    console.error("Could not add the source", error);

    return errorResponse("internal_error", "Could not add the source.");
  }
}

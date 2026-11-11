import {
  apiError,
  apiErrorStatus,
  widgetConfigQuerySchema,
  type ApiErrorCode,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { guardPublicRequest } from "../../../../lib/arcjet";
import { readWidgetConfig } from "../../../../lib/widget";

/**
 * The config of the widget of one project (docs/project.md §6.5, §8).
 *
 * The route is public: the loader of the customer's website calls it from
 * any origin, so the answer carries the header that allows any origin
 * (§9). Owner routes do not get that header; this one does, because the
 * widget lives on someone else's page.
 *
 * No session is required. The public key identifies the project and grants
 * no owner rights (§9).
 */

/** The headers a browser on another origin needs to read the answer. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** The answer for a key that belongs to no project. */
const NOT_FOUND = "There is no such project.";

/**
 * The error answer of the route.
 *
 * The CORS headers are on the errors too: a loader that cannot read the
 * answer sees a network error instead of the 404, and then it cannot tell
 * that the key is the problem.
 */
function errorResponse(code: ApiErrorCode, message: string): Response {
  return Response.json(apiError(code, message), {
    status: apiErrorStatus(code),
    headers: CORS_HEADERS,
  });
}

/** `GET /api/widget/config?key=pk_...` - the plan-applied config. */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");

  // The limit is on the route itself and before anything is read: a request
  // that is over the limit must not reach the database (§9). The route
  // carries no message, so only the limit applies here.
  const guard = await guardPublicRequest({ request, publicKey: key });

  if (guard.blocked) {
    return errorResponse(guard.code, guard.message);
  }

  const parsed = widgetConfigQuerySchema.safeParse({ key });

  if (!parsed.success) {
    // No key at all: the query does not match the schema of the route.
    if (key === null) {
      return errorResponse("invalid_request", "The widget config needs a public key.");
    }

    // A key that cannot belong to a project is a key we do not know. The
    // answer must not tell the caller that the key was well formed and only
    // the project is missing, so this is the same 404 as for a key that
    // resolves to nothing.
    return errorResponse("not_found", NOT_FOUND);
  }

  try {
    const config = await readWidgetConfig(parsed.data.key);

    if (!config) {
      return errorResponse("not_found", NOT_FOUND);
    }

    const body: WidgetConfigResponse = { config };

    return Response.json(body, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Could not read the widget config", error);

    return errorResponse("internal_error", "Could not read the widget config.");
  }
}

/**
 * `OPTIONS /api/widget/config` - the preflight.
 *
 * A plain fetch needs no preflight, but a caller that sets a header of its
 * own does, and the loader runs on someone else's page.
 */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

import { apiError, apiErrorStatus, type ApiErrorCode } from "@askwell/shared";

/**
 * The answers of the project routes (team rules).
 *
 * Every error is the shared shape `{ error: { code, message } }` with the
 * status that belongs to the code.
 */

/** The error answer of a route. */
export function errorResponse(code: ApiErrorCode, message: string): Response {
  return Response.json(apiError(code, message), { status: apiErrorStatus(code) });
}

/**
 * The body of a request, or `null` when it is not JSON.
 *
 * A body that cannot be read is a bad request, not a server error.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

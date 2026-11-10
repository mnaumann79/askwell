import { apiError, apiErrorStatus, type ApiErrorCode } from "@askwell/shared";

/**
 * The error answer of the project routes.
 *
 * Every route answers with the shared shape `{ error: { code, message } }` and
 * the status that goes with the code (team rules).
 */
export function errorResponse(code: ApiErrorCode, message: string): Response {
  return Response.json(apiError(code, message), { status: apiErrorStatus(code) });
}

/** The answer when something goes wrong on our side. */
export function internalErrorResponse(): Response {
  return errorResponse("internal_error", "Something went wrong. Please try again.");
}

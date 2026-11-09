import { z } from "zod";

/**
 * The error shape every route answers with: `{ error: { code, message } }`
 * (team rules).
 */
export const apiErrorCodeSchema = z.enum([
  /** The body or the query does not match the schema of the route. */
  "invalid_request",
  /** There is no signed-in user. */
  "unauthorized",
  /** Signed in, but not allowed to do this. */
  "forbidden",
  /** There is no such project, conversation or source. */
  "not_found",
  /** The plan does not allow this: the project or knowledge limit is reached. */
  "conflict",
  /** The plan does not allow this: the customize page needs Pro. */
  "payment_required",
  /** Too many requests from this public key and IP. */
  "rate_limited",
  /** The monthly message quota of the project is used up. */
  "quota_exceeded",
  /** The message was blocked as a prompt injection attempt. */
  "message_blocked",
  /** Something went wrong on our side. */
  "internal_error",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** The HTTP status that goes with each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  payment_required: 402,
  forbidden: 403,
  message_blocked: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  internal_error: 500,
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Builds the error body of a route. */
export function apiError(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** The HTTP status of an error code. */
export function apiErrorStatus(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code];
}

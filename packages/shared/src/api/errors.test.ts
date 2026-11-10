import { describe, expect, it } from "vitest";
import { apiError, apiErrorSchema, apiErrorStatus, API_ERROR_STATUS } from "./errors";

describe("the api error shape", () => {
  it("is an error object with a code and a message", () => {
    const body = apiError("not_found", "No such project.");

    expect(body).toEqual({ error: { code: "not_found", message: "No such project." } });
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a body that is not the error shape", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "made_up", message: "x" } }).success).toBe(
      false,
    );
    expect(apiErrorSchema.safeParse({ error: { code: "not_found" } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ message: "no error object" }).success).toBe(false);
  });

  it("gives every code an http status", () => {
    expect(apiErrorStatus("invalid_request")).toBe(400);
    expect(apiErrorStatus("unauthorized")).toBe(401);
    expect(apiErrorStatus("payment_required")).toBe(402);
    expect(apiErrorStatus("not_found")).toBe(404);
    expect(apiErrorStatus("conflict")).toBe(409);
    expect(apiErrorStatus("rate_limited")).toBe(429);
    expect(apiErrorStatus("quota_exceeded")).toBe(429);
    expect(apiErrorStatus("internal_error")).toBe(500);
  });

  it("has a status for every code it knows", () => {
    for (const code of Object.keys(API_ERROR_STATUS)) {
      expect(apiErrorStatus(code as keyof typeof API_ERROR_STATUS)).toBeGreaterThanOrEqual(400);
    }
  });
});

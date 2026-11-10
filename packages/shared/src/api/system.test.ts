import { describe, expect, it } from "vitest";
import { posthogConfigResponseSchema } from "./system";

describe("GET /api/posthog-config", () => {
  it("answers with the public key and the host", () => {
    const body = { key: "phc_1234567890abcdef", host: "https://eu.i.posthog.com" };

    expect(posthogConfigResponseSchema.safeParse(body).success).toBe(true);
  });

  it("refuses an answer without a key or with a host that is not a url", () => {
    expect(
      posthogConfigResponseSchema.safeParse({ host: "https://eu.i.posthog.com" }).success,
    ).toBe(false);
    expect(posthogConfigResponseSchema.safeParse({ key: "phc_1234567890abcdef" }).success).toBe(
      false,
    );
    expect(
      posthogConfigResponseSchema.safeParse({
        key: "phc_1234567890abcdef",
        host: "eu.i.posthog.com",
      }).success,
    ).toBe(false);
  });
});

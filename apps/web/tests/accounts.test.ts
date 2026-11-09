import { describe, expect, it } from "vitest";
import { getOrCreateAccount } from "../lib/accounts";

describe("getOrCreateAccount", () => {
  it("returns a free account for the given Clerk user", async () => {
    const account = await getOrCreateAccount("user_123");

    expect(account.clerkUserId).toBe("user_123");
    expect(account.plan).toBe("free");
    expect(account.createdAt).toBeTruthy();
  });

  it("refuses an empty Clerk user id", async () => {
    await expect(getOrCreateAccount("")).rejects.toThrow(/Clerk user id/);
  });
});

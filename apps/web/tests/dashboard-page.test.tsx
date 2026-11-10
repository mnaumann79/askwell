import { describe, expect, it, vi } from "vitest";
import { renderToHtml } from "./render-to-html";

const { protect, getOrCreateAccount } = vi.hoisted(() => ({
  protect: vi.fn(async () => ({ userId: "user_test_1" })),
  getOrCreateAccount: vi.fn(async (clerkUserId: string) => ({
    clerkUserId,
    plan: "free" as const,
    createdAt: "1970-01-01T00:00:00.000Z",
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));
vi.mock("../lib/accounts", () => ({ getOrCreateAccount }));

import DashboardPage from "../app/dashboard/page";

describe("dashboard page", () => {
  it("shows the empty state", async () => {
    const html = await renderToHtml(<DashboardPage />);

    expect(html).toContain("Nothing here yet");
  });

  it("leads to the projects page", async () => {
    const html = await renderToHtml(<DashboardPage />);

    expect(html).toContain('href="/dashboard/projects"');
    expect(html).toContain("Create a project");
  });

  it("shows the plan of the owner's account", async () => {
    const html = await renderToHtml(<DashboardPage />);

    expect(html).toContain("free plan");
  });

  it("creates the account for the signed-in Clerk user", async () => {
    await renderToHtml(<DashboardPage />);

    expect(getOrCreateAccount).toHaveBeenCalledWith("user_test_1");
  });

  it("protects the page with auth.protect()", async () => {
    await renderToHtml(<DashboardPage />);

    expect(protect).toHaveBeenCalled();
  });
});

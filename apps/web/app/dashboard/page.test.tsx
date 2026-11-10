import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

/**
 * The Overview (docs/project.md §6.2).
 *
 * The page is a server component: it protects the session and reads the
 * account on the server. Both are mocked here — what the test looks at is the
 * page's own content.
 */
vi.mock("@clerk/nextjs/server", () => ({
  auth: {
    protect: async () => ({ userId: "user_1" }),
  },
}));

vi.mock("../../lib/accounts", () => ({
  getOrCreateAccount: async () => ({
    clerkUserId: "user_1",
    plan: "free",
    createdAt: "2026-11-10T00:00:00.000Z",
  }),
}));

/** The Overview, as the server renders it. */
async function renderOverview(): Promise<string> {
  const stream = await renderToReadableStream(<DashboardPage />);

  return new Response(stream).text();
}

describe("the dashboard Overview", () => {
  it("leads to the projects page", async () => {
    const html = await renderOverview();

    expect(html).toContain('href="/dashboard/projects"');
    expect(html).toContain("Create a project");
  });

  it("still shows the plan badge and the empty state", async () => {
    const html = await renderOverview();

    expect(html).toContain("free plan");
    expect(html).toContain("Nothing here yet");
  });
});

import { describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@askwell/shared";
import { renderToHtml } from "./render-to-html";

const { protect } = vi.hoisted(() => ({
  protect: vi.fn(async () => ({ userId: "user_test_1" })),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));

import DashboardLayout from "../app/dashboard/layout";

describe("dashboard layout", () => {
  it("protects the dashboard with auth.protect()", async () => {
    await renderToHtml(
      <DashboardLayout>
        <p>content</p>
      </DashboardLayout>,
    );

    expect(protect).toHaveBeenCalled();
  });

  it("shows the app name and the dashboard sections", async () => {
    const html = await renderToHtml(
      <DashboardLayout>
        <p>content</p>
      </DashboardLayout>,
    );

    expect(html).toContain(APP_NAME);
    expect(html).toContain("Overview");
    expect(html).toContain("Projects");
  });

  it("uses the light theme", async () => {
    const html = await renderToHtml(
      <DashboardLayout>
        <p>content</p>
      </DashboardLayout>,
    );

    expect(html).toContain("theme-light");
  });
});

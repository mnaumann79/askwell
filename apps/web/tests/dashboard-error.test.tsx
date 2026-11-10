import { describe, expect, it, vi } from "vitest";
import { renderToHtml } from "./render-to-html";

import DashboardError from "../app/dashboard/error";

describe("dashboard error state", () => {
  it("tells the owner what happened and offers a retry", async () => {
    const html = await renderToHtml(<DashboardError error={new Error("boom")} reset={vi.fn()} />);

    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
  });
});

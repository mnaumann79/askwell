import { describe, expect, it } from "vitest";
import { renderToHtml } from "./render-to-html";

import DashboardLoading from "../app/dashboard/loading";

describe("dashboard loading state", () => {
  it("marks the page as busy", async () => {
    const html = await renderToHtml(<DashboardLoading />);

    expect(html).toContain('aria-busy="true"');
  });
});

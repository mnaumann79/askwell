import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanNote } from "./plan-note";

describe("PlanNote", () => {
  it("tells a Free owner that the customizer is Pro", () => {
    const html = renderToStaticMarkup(<PlanNote plan="free" />);

    expect(html).toContain("Pro");
    expect(html).toContain("Customize");
  });

  it("says nothing to a Pro owner", () => {
    const html = renderToStaticMarkup(<PlanNote plan="pro" />);

    expect(html).toBe("");
  });
});

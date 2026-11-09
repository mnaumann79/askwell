import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import HomePage from "../app/page";

describe("landing page", () => {
  it("shows the app name from @askwell/shared", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(APP_NAME);
  });

  it("has every section of the landing page", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("how-it-works");
    expect(html).toContain('id="demo"');
    expect(html).toContain('id="pricing"');
    expect(html).toContain('id="install"');
  });

  it("sends the call to action to the sign-up page", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('href="/sign-up"');
  });

  it("shows the plan limits from @askwell/shared, not hardcoded ones", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(String(PLAN_LIMITS.free.projects));
    expect(html).toContain(String(PLAN_LIMITS.free.messagesPerMonth));
    expect(html).toContain(String(PLAN_LIMITS.pro.knowledgeSources));
  });

  it("shows the install snippet with a placeholder key", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("widget.js");
    expect(html).toContain("data-key=");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import HomePage from "../app/page";

const APP_URL = "https://askwell.example";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

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

  it("names the app from @askwell/shared in the steps, not as a literal", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const steps = html.slice(html.indexOf('id="how-it-works"'), html.indexOf('id="demo"'));

    expect(steps).toContain(APP_NAME);
  });

  it("shows the plan limits from @askwell/shared, not hardcoded ones", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(String(PLAN_LIMITS.free.projects));
    expect(html).toContain(String(PLAN_LIMITS.free.messagesPerMonth));
    expect(html).toContain(String(PLAN_LIMITS.pro.knowledgeSources));
  });

  it("shows the plan comparison of docs/project.md §5", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Button color");
    expect(html).toContain("Any corner");
    expect(html).toContain("Powered by");
  });

  it("shows the empty, loading and error states", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('data-state="empty"');
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('data-state="error"');
  });

  it("shows the install snippet with a placeholder key", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("widget.js");
    expect(html).toContain("data-key=");
  });

  it("carries the app url in the static HTML, the fallback of the server", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(`${APP_URL}/widget.js`);
  });

  it("carries the placeholder in the static HTML when the app url is not set", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("https://your-app.example/widget.js");
  });
});

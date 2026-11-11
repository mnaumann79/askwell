// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://askwell.example" }
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import HomePage from "../app/page";

/**
 * The landing page in a browser (jsdom).
 *
 * The install snippet names the origin the page is served from, and only the
 * browser knows that origin — so the snippet is built in the browser. The
 * other half of it, the static HTML with the fallback, is in page.test.tsx.
 */

/** The origin the page is served from, in this browser. */
const ORIGIN = "https://askwell.example";

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<HomePage />);
  });

  return { container, root };
}

/** The snippet the browser rendered, as text. */
function snippetOf(container: HTMLElement): string {
  return container.querySelector("#install code")?.textContent ?? "";
}

beforeEach(() => {
  // React only lets `act` run when it knows it is in a test.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  document.body.innerHTML = "";
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("the landing page in a browser", () => {
  it("shows a snippet that names the origin the page was served from", async () => {
    const { container } = await mount();

    expect(snippetOf(container)).toContain(`${ORIGIN}/widget.js`);
  });

  it("names the origin the page was served from, not the build-time app url", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://your-app.example";

    const { container } = await mount();

    expect(snippetOf(container)).toContain(`${ORIGIN}/widget.js`);
    expect(snippetOf(container)).not.toContain("https://your-app.example");
  });

  it("keeps the placeholder key", async () => {
    const { container } = await mount();

    expect(snippetOf(container)).toContain('data-key="pk_..."');
  });
});

import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../tests/render-to-html";
import EmbedPage from "./page";

const KEY = "pk_0123456789abcdef0123456789abcdef";

describe("the embed route", () => {
  it("renders the panel", async () => {
    const html = await renderToHtml(
      await EmbedPage({ searchParams: Promise.resolve({ key: KEY }) }),
    );

    // The config is fetched in the browser, so the first render is the
    // loading state.
    expect(html).toContain('data-state="loading"');
  });

  it("renders the panel without a key as well", async () => {
    const html = await renderToHtml(await EmbedPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('data-state="loading"');
  });
});

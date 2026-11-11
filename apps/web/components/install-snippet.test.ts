import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackOrigin, installSnippet, pageOrigin } from "./install-snippet";

const APP_URL = "https://askwell.example";
const ORIGIN = "https://preview.askwell.example";
const KEY = `pk_${"a".repeat(32)}`;

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.unstubAllGlobals();
});

describe("installSnippet", () => {
  it("is the script tag the widget expects", () => {
    expect(installSnippet(KEY, ORIGIN)).toBe(
      `<script src="${ORIGIN}/widget.js" data-key="${KEY}"></script>`,
    );
  });

  it("names the origin it is given", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    expect(installSnippet(KEY, ORIGIN)).toContain(`${ORIGIN}/widget.js`);
  });

  it("names the origin the page is served from, not the build-time app url", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    vi.stubGlobal("window", { location: { origin: ORIGIN } });

    expect(installSnippet(KEY)).toContain(`${ORIGIN}/widget.js`);
    expect(installSnippet(KEY)).not.toContain(APP_URL);
  });

  it("carries the public key it is given", () => {
    const first = `pk_${"1".repeat(32)}`;
    const second = `pk_${"2".repeat(32)}`;

    expect(installSnippet(first, ORIGIN)).toContain(first);
    expect(installSnippet(first, ORIGIN)).not.toContain(second);
  });

  it("falls back to the app url when there is no origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    expect(installSnippet(KEY)).toContain(`${APP_URL}/widget.js`);
  });

  it("falls back to a placeholder URL when there is neither an origin nor an app url", () => {
    expect(installSnippet(KEY)).toContain("https://your-app.example");
  });
});

describe("pageOrigin", () => {
  it("is the origin the page is served from", () => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });

    expect(pageOrigin()).toBe(ORIGIN);
  });

  it("is nothing on the server", () => {
    expect(pageOrigin()).toBeUndefined();
  });
});

describe("fallbackOrigin", () => {
  it("is the app url when it is set", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    expect(fallbackOrigin()).toBe(APP_URL);
  });

  it("is the placeholder when the app url is not set", () => {
    expect(fallbackOrigin()).toBe("https://your-app.example");
  });
});

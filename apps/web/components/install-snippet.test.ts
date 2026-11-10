import { afterEach, describe, expect, it } from "vitest";
import { installSnippet } from "./install-snippet";

const APP_URL = "https://askwell.example";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("installSnippet", () => {
  it("is the script tag the widget expects", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    const key = `pk_${"a".repeat(32)}`;

    expect(installSnippet(key)).toBe(
      `<script src="${APP_URL}/widget.js" data-key="${key}"></script>`,
    );
  });

  it("carries the public key it is given", () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;

    const first = `pk_${"1".repeat(32)}`;
    const second = `pk_${"2".repeat(32)}`;

    expect(installSnippet(first)).toContain(first);
    expect(installSnippet(first)).not.toContain(second);
  });

  it("falls back to a placeholder URL when there is no app URL", () => {
    expect(installSnippet(`pk_${"a".repeat(32)}`)).toContain("https://your-app.example");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@askwell/shared";
import HomePage from "../app/page";

describe("home page", () => {
  it("shows the app name from @askwell/shared", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain(APP_NAME);
  });
});

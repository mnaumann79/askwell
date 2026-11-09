import { describe, expect, it } from "vitest";
import { APP_NAME } from "./app-name";
import { pageTitle } from "./page-title";

describe("pageTitle", () => {
  it("returns the app name alone when there is no section", () => {
    expect(pageTitle()).toBe("Askwell");
  });

  it("puts the section first, separated by a middot", () => {
    expect(pageTitle("Dashboard")).toBe("Dashboard · Askwell");
  });

  it("ignores an empty or blank section", () => {
    expect(pageTitle("")).toBe(APP_NAME);
    expect(pageTitle("   ")).toBe(APP_NAME);
  });

  it("reads the name from APP_NAME", () => {
    expect(pageTitle("Knowledge")).toBe(`Knowledge · ${APP_NAME}`);
  });
});

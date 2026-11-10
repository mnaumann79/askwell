import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const widgetDir = path.join(here, "..");
const bundle = path.join(widgetDir, "..", "web", "public", "widget.js");
const check = path.join(widgetDir, "scripts", "check-size.mjs");

/** The limit from docs/project.md §3. */
const LIMIT = 5 * 1024;

describe("the size budget", () => {
  it("keeps the bundle under 5 kb", async () => {
    const { size } = await stat(bundle);
    expect(size).toBeLessThanOrEqual(LIMIT);
  });

  it("passes the check with the real limit", () => {
    const output = execFileSync(process.execPath, [check], { encoding: "utf8" });
    expect(output).toContain("check:size");
  });

  it("fails the check when the bundle is over the limit", () => {
    expect(() =>
      execFileSync(process.execPath, [check], {
        encoding: "utf8",
        env: { ...process.env, WIDGET_MAX_BYTES: "1" },
      }),
    ).toThrow();
  });
});

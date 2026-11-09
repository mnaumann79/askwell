import { describe, expect, it } from "vitest";
import { init } from "./index";

describe("widget loader", () => {
  it("is a placeholder that does nothing yet", () => {
    expect(init()).toBeUndefined();
  });
});

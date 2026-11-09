import { describe, expect, it } from "vitest";
import { APP_NAME } from "./app-name";
import { DEFAULT_WIDGET_CONFIG } from "./widget-config";

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("puts the button in the bottom right corner", () => {
    expect(DEFAULT_WIDGET_CONFIG.position).toBe("bottom-right");
  });

  it("opens with the fade animation", () => {
    expect(DEFAULT_WIDGET_CONFIG.animation).toBe("fade");
  });

  it("shows the badge", () => {
    expect(DEFAULT_WIDGET_CONFIG.showBadge).toBe(true);
  });

  it("uses the app name as the default header text", () => {
    expect(DEFAULT_WIDGET_CONFIG.headerText).toBe(APP_NAME);
  });

  it("has a button color and a label", () => {
    expect(DEFAULT_WIDGET_CONFIG.buttonColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_WIDGET_CONFIG.label.length).toBeGreaterThan(0);
  });
});

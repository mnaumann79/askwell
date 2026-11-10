import { describe, expect, it } from "vitest";
import { APP_NAME } from "./app-name";
import { DEFAULT_WIDGET_CONFIG, widgetConfigSchema } from "./widget-config";

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

  it("satisfies the config schema", () => {
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true);
  });
});

describe("the button color", () => {
  it("takes a hex color", () => {
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "#1a2b3c" }).success,
    ).toBe(true);
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "#abc" }).success,
    ).toBe(true);
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "#ABCDEF" }).success,
    ).toBe(true);
  });

  it("refuses a color that is not hex", () => {
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "red" }).success,
    ).toBe(false);
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "#12345" }).success,
    ).toBe(false);
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "rgb(1,2,3)" }).success,
    ).toBe(false);
    expect(
      widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "" }).success,
    ).toBe(false);
  });

  it("says what is wrong", () => {
    const parsed = widgetConfigSchema.safeParse({
      ...DEFAULT_WIDGET_CONFIG,
      buttonColor: "red",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/hex/);
  });
});

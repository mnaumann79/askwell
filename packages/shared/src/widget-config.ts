import { z } from "zod";
import { APP_NAME } from "./app-name";

/** Where the widget button sits on the customer's page (§5). */
export const widgetPositionSchema = z.enum([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);
export type WidgetPosition = z.infer<typeof widgetPositionSchema>;

/** How the panel opens (§5). */
export const widgetAnimationSchema = z.enum(["fade", "slide", "scale"]);
export type WidgetAnimation = z.infer<typeof widgetAnimationSchema>;

/**
 * The button color is a hex color: `#rgb` or `#rrggbb`.
 *
 * The widget loader renders the button with this value and renders nothing
 * when it is not a hex color (§6.5), so the contract says hex too: a config
 * that satisfies the contract is always one the widget can render.
 */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The config of a widget: what the widget loader reads and the customizer writes. */
export const widgetConfigSchema = z.object({
  /**
   * Button color as a hex color, like `#1a2b3c`.
   *
   * The color is checked here and not only in the widget, so the owner is
   * told what is wrong instead of the widget silently rendering nothing.
   */
  buttonColor: z
    .string()
    .regex(HEX_COLOR_PATTERN, "The button color must be a hex color, like #1a2b3c."),
  position: widgetPositionSchema,
  /** Text on the button. */
  label: z.string(),
  animation: widgetAnimationSchema,
  /** Text in the panel header. */
  headerText: z.string(),
  /** Whether the "Powered by" badge shows. Free always shows it. */
  showBadge: z.boolean(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

/**
 * The config a new project starts with.
 *
 * Free gets the defaults and the badge (§5). The customizer reads these
 * values as the starting point for the form.
 */
export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  buttonColor: "#111111",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  headerText: APP_NAME,
  showBadge: true,
};

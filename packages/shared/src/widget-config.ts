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

/** The config of a widget: what the widget loader reads and the customizer writes. */
export const widgetConfigSchema = z.object({
  /** Button color as a CSS color. */
  buttonColor: z.string(),
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

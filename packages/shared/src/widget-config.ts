import { APP_NAME } from "./app-name";

/** Where the widget button sits on the customer's page (§5). */
export type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** How the panel opens (§5). */
export type WidgetAnimation = "fade" | "slide" | "scale";

export type WidgetConfig = {
  /** Button color as a CSS color. */
  buttonColor: string;
  position: WidgetPosition;
  /** Text on the button. */
  label: string;
  animation: WidgetAnimation;
  /** Text in the panel header. */
  headerText: string;
  /** Whether the "Powered by" badge shows. Free always shows it. */
  showBadge: boolean;
};

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

/**
 * The messages the loader and the panel exchange (docs/project.md §6.5).
 *
 * Both sides check the origin of every message they take, and neither ever
 * sends to `*` (docs/project.md §9).
 */

/** The visitor clicked the button: the panel shows. */
export const WIDGET_OPEN = "askwell:open";
/** The panel closes. */
export const WIDGET_CLOSE = "askwell:close";
/** The panel is mounted and can be talked to. */
export const WIDGET_READY = "askwell:ready";
/** The panel tells the loader how tall it is. */
export const WIDGET_RESIZE = "askwell:resize";
/** The panel tells the loader how many unread messages there are. */
export const WIDGET_UNREAD = "askwell:unread";

export type WidgetMessage =
  | { type: typeof WIDGET_OPEN }
  | { type: typeof WIDGET_CLOSE }
  | { type: typeof WIDGET_READY }
  | { type: typeof WIDGET_RESIZE; height: number }
  | { type: typeof WIDGET_UNREAD; count: number };

const WIDGET_MESSAGE_TYPES: readonly string[] = [
  WIDGET_OPEN,
  WIDGET_CLOSE,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_UNREAD,
];

/** Whether a value that came out of `postMessage` is one of our messages. */
export function isWidgetMessage(value: unknown): value is WidgetMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && WIDGET_MESSAGE_TYPES.includes(type);
}

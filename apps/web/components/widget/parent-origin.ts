import { isWidgetMessage, type WidgetMessage } from "@askwell/widget";

/**
 * The page that embeds the panel, and the messages it sends.
 *
 * The panel runs in an iframe on the app's origin; the loader runs in the
 * customer's page. So the two sides see each other under different origins:
 * the panel receives the loader's messages with the customer's origin, and the
 * loader receives the panel's messages with the app's origin. Each side checks
 * the origin of every message it takes against the other side's origin, and
 * neither ever sends to `*` (docs/project.md §9).
 */

/**
 * The origin of the page that embeds the panel.
 *
 * The iframe's referrer is that page. Nothing when the panel is opened
 * directly, or when the referrer is not there: then the panel has nobody to
 * talk to and stays quiet.
 */
export function parentOrigin(referrer: string): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}

/**
 * The message the embedding page sent, if it is one of ours.
 *
 * A message from another origin is not ours and is ignored.
 */
export function readParentMessage(
  event: { origin: string; data: unknown },
  origin: string,
): WidgetMessage | null {
  if (event.origin !== origin) {
    return null;
  }

  if (!isWidgetMessage(event.data)) {
    return null;
  }

  return event.data;
}

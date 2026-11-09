import { APP_NAME } from "./app-name";

/**
 * Builds a page title from an optional section name.
 *
 * `pageTitle()` → "Askwell", `pageTitle("Dashboard")` → "Dashboard · Askwell".
 */
export function pageTitle(section?: string): string {
  const name = section?.trim();
  return name ? `${name} · ${APP_NAME}` : APP_NAME;
}

/**
 * The public key and the config of the project (docs/project.md §6.5).
 *
 * The loader is dependency free, so the shapes it needs are checked here
 * instead of with the schemas of `packages/shared` — pulling zod into the
 * bundle would cost more than the whole 5 kb budget (docs/project.md §3).
 */

/** Where the widget button sits on the customer's page (docs/project.md §5). */
export type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** How the panel opens (docs/project.md §5). */
export type WidgetAnimation = "fade" | "slide" | "scale";

/** The parts of the config the loader itself uses. */
export interface WidgetSettings {
  /** Button color as a CSS color. */
  buttonColor: string;
  position: WidgetPosition;
  /** Text on the button. */
  label: string;
  animation: WidgetAnimation;
}

const POSITIONS: readonly string[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const ANIMATIONS: readonly string[] = ["fade", "slide", "scale"];

/** The same shape the config route accepts (packages/shared, widget config). */
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The public key of the project, read from the loader's own script tag. */
export function readPublicKey(
  script: { getAttribute(name: string): string | null } | null,
): string | null {
  const key = script?.getAttribute("data-key")?.trim();
  return key ? key : null;
}

/** The config route, on the origin the script itself came from. */
export function configUrl(origin: string, key: string): string {
  return `${origin}/api/widget/config?key=${encodeURIComponent(key)}`;
}

/** The panel, on the same origin. */
export function panelUrl(origin: string, key: string): string {
  return `${origin}/embed?key=${encodeURIComponent(key)}`;
}

function parseSettings(value: unknown): WidgetSettings | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const config = (value as { config?: unknown }).config;
  if (typeof config !== "object" || config === null) {
    return null;
  }
  const fields = config as Record<string, unknown>;
  if (typeof fields.buttonColor !== "string" || !COLOR.test(fields.buttonColor)) {
    return null;
  }
  if (typeof fields.label !== "string") {
    return null;
  }
  if (typeof fields.position !== "string" || !POSITIONS.includes(fields.position)) {
    return null;
  }
  if (typeof fields.animation !== "string" || !ANIMATIONS.includes(fields.animation)) {
    return null;
  }
  return {
    buttonColor: fields.buttonColor,
    label: fields.label,
    position: fields.position as WidgetPosition,
    animation: fields.animation as WidgetAnimation,
  };
}

/**
 * The config of the project.
 *
 * An unknown key answers 404 and nothing renders, quietly. A 5xx means the
 * database refused the call — a different failure, and one the person who
 * owns the website should hear about — so it is logged once and nothing
 * renders either way (docs/runbook.md §1.5).
 */
export async function loadSettings(
  url: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<WidgetSettings | null> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" } });
  } catch {
    return null;
  }

  if (!response.ok) {
    if (response.status >= 500) {
      console.warn(`[askwell] the widget config could not be loaded: ${response.status}`);
    }
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  return parseSettings(body);
}

/**
 * Askwell widget loader (docs/project.md §6.5).
 *
 * This file runs on the customer's own website, so it has to stay small (under
 * 5 kb), dependency free and free of any global CSS.
 *
 * Phase 0 placeholder. The real loader reads `data-key` from its script tag,
 * fetches the widget config, renders the button inside a shadow root and opens
 * the panel in an iframe. That behavior arrives in Phase 2 — see §6.5 for the
 * contract this file has to meet.
 */

/**
 * Entry point of the loader.
 *
 * Does nothing yet. It exists so the bundle, the size check and the build
 * pipeline are in place before the loader has behavior.
 */
export function init(): void {
  // Phase 2: read `data-key`, fetch the config, render the button, open the iframe.
}

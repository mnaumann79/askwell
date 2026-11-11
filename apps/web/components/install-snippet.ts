/**
 * The script tag the widget expects (docs/project.md §6.5).
 *
 * One builder, two callers: the landing page shows the shape with a
 * placeholder key, and the install page shows it with the project's own key.
 * The loader reads exactly one attribute, `data-key`, so the two cannot drift
 * apart.
 *
 * The host is the origin the page is served from — `window.location.origin` —
 * so a snippet can never name another deployment. There is no window on the
 * server, so `NEXT_PUBLIC_APP_URL` is the fallback there: the prerendered
 * landing page carries it until the browser replaces it with the origin the
 * page is served from.
 */

/** The origin the page is served from. Nothing on the server. */
export function pageOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

/** The host to use when there is no origin: the app url, else the placeholder. */
export function fallbackOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.example";
}

/**
 * The script tag, for the origin the page is served from.
 *
 * `origin` is the origin to name. Without one the origin the browser is on
 * is used, and the app url is the last fallback — the case of the server,
 * where there is no browser.
 */
export function installSnippet(publicKey: string, origin?: string): string {
  const host = origin ?? pageOrigin() ?? fallbackOrigin();

  return `<script src="${host}/widget.js" data-key="${publicKey}"></script>`;
}

/**
 * The script tag the widget expects (docs/project.md §6.5).
 *
 * One builder, two callers: the landing page shows the shape with a
 * placeholder key, and the install page shows it with the project's own key.
 * The loader reads exactly one attribute, `data-key`, so the two cannot drift
 * apart.
 */
export function installSnippet(publicKey: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.example";

  return `<script src="${appUrl}/widget.js" data-key="${publicKey}"></script>`;
}

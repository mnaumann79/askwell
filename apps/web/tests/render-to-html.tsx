import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";

/**
 * Renders a server component to HTML.
 *
 * `renderToStaticMarkup` cannot render an async component, and the dashboard
 * pages are async (they read the session), so we use the streaming renderer
 * and wait for it to finish.
 */
export async function renderToHtml(node: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;

  return new Response(stream).text();
}

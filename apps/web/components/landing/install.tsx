"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "./section-heading";
import { CopyButton } from "../copy-button";
import { fallbackOrigin, installSnippet, pageOrigin } from "../install-snippet";

/**
 * The install snippet (docs/project.md §6.1, §6.9).
 *
 * The real snippet carries the owner's own public key, which the install page
 * shows (Phase 2), so this one uses a placeholder. Both come from the same
 * builder, so the two cannot drift apart.
 *
 * The page is prerendered, so the static HTML carries the fallback — the app
 * url, or the placeholder — and the browser replaces it with the origin the
 * page is served from. The snippet is therefore built in the component, and
 * not at module scope, where there is no browser to read the origin from.
 */
const PLACEHOLDER_KEY = "pk_...";

export function Install() {
  const [origin, setOrigin] = useState(fallbackOrigin);

  useEffect(() => {
    setOrigin(pageOrigin() ?? fallbackOrigin());
  }, []);

  const snippet = installSnippet(PLACEHOLDER_KEY, origin);

  return (
    <section
      id="install"
      className="scroll-reveal mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24"
    >
      <SectionHeading
        eyebrow="Install"
        title="One script tag"
        lead="Paste it into your site and the widget is there."
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-card border border-border bg-surface p-5 text-sm text-foreground shadow-glass backdrop-blur-glass">
          <code>{snippet}</code>
        </pre>

        <CopyButton text={snippet} />

        <p className="text-xs text-muted">
          The key belongs to your project. Every project gets its own, so you can tell them apart.
        </p>
      </div>
    </section>
  );
}

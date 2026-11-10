import { SectionHeading } from "./section-heading";
import { CopyButton } from "./copy-button";

/**
 * The install snippet (docs/project.md §6.1, §6.9).
 *
 * The real snippet carries the owner's own public key, which arrives with
 * projects in Phase 2, so this one uses a placeholder.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.example";
const SNIPPET = `<script src="${APP_URL}/widget.js" data-key="pk_..."></script>`;

export function Install() {
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
          <code>{SNIPPET}</code>
        </pre>

        <CopyButton text={SNIPPET} />

        <p className="text-xs text-muted">
          The key belongs to your project. Every project gets its own, so you can tell them apart.
        </p>
      </div>
    </section>
  );
}

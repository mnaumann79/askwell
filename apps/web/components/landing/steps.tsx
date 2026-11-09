import { APP_NAME } from "@askwell/shared";
import { SectionHeading } from "./section-heading";

/**
 * How it works (docs/project.md §6.1, §2).
 */
const STEPS = [
  {
    title: "Add your product info",
    body: `Paste text or upload a PDF. ${APP_NAME} reads it and keeps it as the only thing it answers from.`,
  },
  {
    title: "Copy one script tag",
    body: "Paste the tag into your site and the chat button appears in the corner of every page.",
  },
  {
    title: "Visitors get answers",
    body: "The bot answers from your information, and says it does not know when it does not.",
  },
];

export function Steps() {
  return (
    <section
      id="how-it-works"
      className="scroll-reveal mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24"
    >
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, one script tag"
        lead="No bot training, no workflows. Give it what you already wrote."
      />

      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6 shadow-glass backdrop-blur-glass"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-card border border-border bg-surface-strong text-sm font-semibold text-foreground"
            >
              {index + 1}
            </span>
            <h3 className="text-base font-semibold tracking-tight text-foreground">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

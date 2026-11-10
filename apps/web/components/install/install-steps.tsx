/**
 * The short steps (docs/project.md §6.9).
 *
 * Three lines, not a manual: the whole install is one script tag.
 */
const STEPS = [
  {
    title: "Copy the script tag",
    body: "The copy button above puts it on your clipboard.",
  },
  {
    title: "Paste it into your site",
    body: "In the HTML of every page you want the button on, before the closing body tag.",
  },
  {
    title: "That is the whole install",
    body: "The chat button appears in the corner. No build step, no framework, nothing to keep up to date.",
  },
];

export function InstallSteps() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-card border border-border bg-surface-strong text-xs font-semibold text-foreground"
          >
            {index + 1}
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{step.title}</h2>
          <p className="text-sm leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

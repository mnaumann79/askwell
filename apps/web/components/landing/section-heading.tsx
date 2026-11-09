/**
 * The heading of a landing page section (docs/project.md §13).
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {lead ? <p className="text-sm leading-relaxed text-muted sm:text-base">{lead}</p> : null}
    </div>
  );
}

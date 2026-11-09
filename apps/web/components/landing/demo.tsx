import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { SectionHeading } from "./section-heading";

/**
 * The demo (docs/project.md §6.1).
 *
 * The app's own widget on the landing page arrives in Phase 6, so this is a
 * static preview of the panel: it shows what the visitor sees, it does not
 * answer anything, and it fetches nothing.
 *
 * The panel is shown in both of its states: empty, which is how the widget
 * opens, and with a question answered.
 */
type Message = {
  from: "visitor" | "bot";
  text: string;
};

const CONVERSATION: Message[] = [
  { from: "visitor", text: "Does it work on mobile?" },
  {
    from: "bot",
    text: "Yes. The widget is a small script and the panel fills the screen on a phone.",
  },
];

function Panel({ messages }: { messages: Message[] }) {
  const config = DEFAULT_WIDGET_CONFIG;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-glass backdrop-blur-glass">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm font-semibold tracking-tight text-foreground">{config.headerText}</p>
        <span aria-hidden className="text-xs text-muted">
          ×
        </span>
      </div>

      <div className="flex flex-col gap-3 py-2">
        {messages.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-center text-sm leading-relaxed text-muted">
            No messages yet. Ask a question and the answer comes from your product info.
          </p>
        ) : (
          messages.map((message) => (
            <p
              key={message.text}
              className={
                message.from === "visitor"
                  ? "max-w-[80%] self-end rounded-card bg-surface-strong px-4 py-2 text-sm leading-relaxed text-foreground"
                  : "max-w-[85%] self-start rounded-card border border-border bg-surface px-4 py-2 text-sm leading-relaxed text-muted"
              }
            >
              {message.text}
            </p>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
        Ask a question…
      </div>
    </div>
  );
}

export function Demo() {
  const config = DEFAULT_WIDGET_CONFIG;

  return (
    <section
      id="demo"
      className="scroll-reveal mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24"
    >
      <SectionHeading
        eyebrow="Demo"
        title="What the visitor sees"
        lead="The widget sits in the corner of your site and opens into this panel."
      />

      <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <p className="text-center text-xs text-muted">A visitor asks, and the bot answers.</p>
          <Panel messages={CONVERSATION} />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-center text-xs text-muted">
            And before the first question, it opens like this.
          </p>
          <Panel messages={[]} />
        </div>

        <p className="text-center text-xs text-muted">
          A static preview for now. The live widget runs on this page in a later phase.
          {config.showBadge ? " The badge is always on the free plan." : null}
        </p>
      </div>
    </section>
  );
}

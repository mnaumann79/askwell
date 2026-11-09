import type { ReactNode } from "react";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { StateMessage } from "../state-message";
import { SectionHeading } from "./section-heading";

/**
 * The demo (docs/project.md §6.1).
 *
 * The app's own widget on the landing page arrives in Phase 6, so this is a
 * static preview of the panel: it shows what the visitor sees, it does not
 * answer anything, and it fetches nothing.
 *
 * The panel is shown in every state it has (docs/project.md §13): answered,
 * loading, empty and error.
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

function Panel({ children }: { children: ReactNode }) {
  const config = DEFAULT_WIDGET_CONFIG;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-glass backdrop-blur-glass">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm font-semibold tracking-tight text-foreground">{config.headerText}</p>
        <span aria-hidden className="text-xs text-muted">
          ×
        </span>
      </div>

      <div className="flex flex-col gap-3 py-2">{children}</div>

      <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
        Ask a question…
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  return (
    <p
      className={
        message.from === "visitor"
          ? "max-w-[80%] self-end rounded-card bg-surface-strong px-4 py-2 text-sm leading-relaxed text-foreground"
          : "max-w-[85%] self-start rounded-card border border-border bg-surface px-4 py-2 text-sm leading-relaxed text-muted"
      }
    >
      {message.text}
    </p>
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
          <Panel>
            {CONVERSATION.map((message) => (
              <Bubble key={message.text} message={message} />
            ))}
          </Panel>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-center text-xs text-muted">While the answer is coming.</p>
            <Panel>
              <StateMessage tone="loading" title="The bot is writing…" />
            </Panel>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-center text-xs text-muted">Before the first question.</p>
            <Panel>
              <StateMessage
                tone="empty"
                title="No messages yet"
                description="Ask a question and the answer comes from your product info."
              />
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-center text-xs text-muted">
            And when the bot cannot answer, the visitor gets a friendly message.
          </p>
          <Panel>
            <StateMessage
              tone="error"
              title="The chat is busy right now"
              description="Please try again in a minute."
            />
          </Panel>
        </div>

        <p className="text-center text-xs text-muted">
          A static preview for now. The live widget runs on this page in a later phase.
          {config.showBadge ? " The badge is always on the free plan." : null}
        </p>
      </div>
    </section>
  );
}

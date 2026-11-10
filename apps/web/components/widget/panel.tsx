"use client";

import { useEffect, useRef, useState } from "react";
import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  MAX_MESSAGE_CHARACTERS,
  apiErrorSchema,
  widgetConfigResponseSchema,
} from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";
import {
  WIDGET_CLOSE,
  WIDGET_OPEN,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_UNREAD,
  type WidgetMessage,
} from "@askwell/widget";
import { StateMessage } from "../state-message";
import { parentOrigin, readParentMessage } from "./parent-origin";
import { getVisitorId } from "./visitor-id";

/**
 * The panel inside the iframe (docs/project.md §6.5).
 *
 * It reads the key from its own URL, fetches the config for the header text
 * and the badge, and talks to the loader with the protocol both sides share
 * (docs/project.md §9).
 */

export interface PanelMessage {
  role: "visitor" | "bot";
  text: string;
}

/** The reply the panel gives while the chat route does not exist yet. */
export const CANNED_REPLY =
  "Thanks for your message! This is a demo reply — the real answers arrive with the chat route in a later phase.";

/** How long the panel shows that it is typing. */
const TYPING_DELAY_MS = 900;

/**
 * Sends a message to the page that embeds the panel.
 *
 * Never to `*`: the origin of the embedding page is the only one that may
 * receive it (docs/project.md §9).
 */
function postToParent(message: WidgetMessage): void {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }

  const origin = parentOrigin(document.referrer);
  if (!origin) {
    return;
  }

  window.parent.postMessage(message, origin);
}

export function Panel({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(true);
  const unreadRef = useRef(0);
  // The visitor ID belongs to the visitor and travels with the chat request
  // once the chat route exists (docs/project.md §6.5).
  const visitorRef = useRef<string | null>(null);

  // The config of the project. Lane A's route (P2P-T02) is not on main yet, so
  // the app answers 404 for it until that route lands: the panel falls back to
  // the default config then, so it can be checked on its own. The end-to-end
  // check waits for the route.
  useEffect(() => {
    if (!publicKey) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/widget/config?key=${encodeURIComponent(publicKey)}`, {
          headers: { accept: "application/json" },
        });

        // A 404 that is not our error shape means the route is not there yet
        // (Lane A's route, P2P-T02, is not on main): the panel falls back to
        // the default config of a new project and can be checked on its own.
        // A 404 that *is* our error shape means the key is unknown, and that
        // is the error state.
        if (response.status === 404) {
          const body: unknown = await response.json().catch(() => null);
          if (apiErrorSchema.safeParse(body).success) {
            if (!cancelled) {
              setStatus("error");
            }
            return;
          }

          if (!cancelled) {
            setConfig(DEFAULT_WIDGET_CONFIG);
            setStatus("ready");
          }
          return;
        }

        if (!response.ok) {
          throw new Error(`the config route answered ${response.status}`);
        }

        const body: unknown = await response.json();
        const parsed = widgetConfigResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new Error("the answer is not a widget config");
        }

        if (!cancelled) {
          setConfig(parsed.data.config);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // The visitor ID: created once, reused on every visit of this project.
  useEffect(() => {
    if (!publicKey) {
      return;
    }

    try {
      visitorRef.current = getVisitorId(window.localStorage, publicKey);
    } catch {
      // Storage can be off. The chat still works, the id is just missing.
    }
  }, [publicKey]);

  // The protocol with the loader. Every message is checked against the origin
  // it must come from, and the panel never sends to `*`.
  useEffect(() => {
    const origin = parentOrigin(document.referrer);
    if (!origin) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const message = readParentMessage(event, origin);
      if (!message) {
        return;
      }

      if (message.type === WIDGET_OPEN) {
        openRef.current = true;
        setOpen(true);
      }

      if (message.type === WIDGET_CLOSE) {
        openRef.current = false;
        setOpen(false);
      }
    };

    window.addEventListener("message", onMessage);
    postToParent({ type: WIDGET_READY });

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  // The height of the panel, so the loader can size the iframe. The panel
  // reports the height its content needs, not the height of the iframe it is
  // in: the loader clamps that between 320 and 640 pixels.
  useEffect(() => {
    const root = rootRef.current;
    const list = listRef.current;
    const content = contentRef.current;
    if (!root || !list || !content) {
      return;
    }

    const report = () => {
      // The list is stretched over the free space of the panel, so the height
      // the panel needs is the panel's height without that free space, plus the
      // height the messages really take.
      const needed = root.clientHeight - list.clientHeight + content.offsetHeight;
      postToParent({ type: WIDGET_RESIZE, height: needed });
    };

    report();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(report);
    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [messages, typing, status]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }

    setMessages((current) => [...current, { role: "visitor", text }]);
    setDraft("");
    setTyping(true);

    // Phase 2 has no AI yet (docs/plan.md): the panel answers itself.
    window.setTimeout(() => {
      setTyping(false);
      setMessages((current) => [...current, { role: "bot", text: CANNED_REPLY }]);

      if (!openRef.current) {
        const count = unreadRef.current + 1;
        unreadRef.current = count;
        postToParent({ type: WIDGET_UNREAD, count });
      }
    }, TYPING_DELAY_MS);
  }

  function close() {
    openRef.current = false;
    setOpen(false);
    postToParent({ type: WIDGET_CLOSE });
  }

  if (status === "loading") {
    return (
      <Frame>
        <StateMessage tone="loading" title="Starting the chat…" />
      </Frame>
    );
  }

  if (status === "error" || !config) {
    return (
      <Frame>
        <StateMessage
          tone="error"
          title="The chat could not be loaded"
          description="Please try again in a moment."
        />
      </Frame>
    );
  }

  return (
    <div
      ref={rootRef}
      data-open={open}
      className="theme-light flex h-dvh flex-col bg-background text-foreground"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h1 className="truncate text-sm font-semibold tracking-tight">{config.headerText}</h1>
        <button
          type="button"
          onClick={close}
          aria-label="Close the chat"
          className="rounded-full p-1 text-muted transition hover:bg-surface hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto">
        <div ref={contentRef} className="flex flex-col gap-3 px-4 py-4">
          <MessageList messages={messages} typing={typing} />
        </div>
      </div>

      <form onSubmit={send} className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a question…"
            maxLength={MAX_MESSAGE_CHARACTERS}
            aria-label="Your question"
            className="min-w-0 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-background transition disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>

      {config.showBadge ? (
        <p className="px-4 pb-3 text-center text-[11px] text-muted">Powered by {APP_NAME}</p>
      ) : null}
    </div>
  );
}

/** The frame every state of the panel sits in. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light flex h-dvh flex-col bg-background text-foreground">
      <div className="flex flex-1 items-center justify-center p-4">{children}</div>
    </div>
  );
}

/** The messages and the typing state. */
export function MessageList({
  messages,
  typing,
}: {
  messages: PanelMessage[];
  typing: boolean;
}) {
  if (messages.length === 0 && !typing) {
    return (
      <StateMessage
        tone="empty"
        title="Ask a question"
        description="The answers come from the product information of this project."
      />
    );
  }

  return (
    <>
      {messages.map((message, index) => (
        <p
          key={`${message.role}-${index}`}
          data-role={message.role}
          className={`max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed ${
            message.role === "visitor"
              ? "ml-auto bg-surface-strong text-foreground"
              : "bg-surface text-foreground"
          }`}
        >
          {message.text}
        </p>
      ))}
      {typing ? (
        <p data-typing className="flex items-center gap-1 px-1 py-1" aria-label="Typing">
          <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted" />
          <span
            className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="animate-pulse h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: "300ms" }}
          />
        </p>
      ) : null}
    </>
  );
}

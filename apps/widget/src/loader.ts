/**
 * The loader itself (docs/project.md §6.5).
 *
 * It runs on the customer's own website, so it may only touch its own shadow
 * root: no global CSS, nothing else on the host page is affected. Every
 * message it takes is checked against the origin it expects, and it never
 * sends to `*` (docs/project.md §9).
 */

import {
  WIDGET_CLOSE,
  WIDGET_OPEN,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_UNREAD,
  isWidgetMessage,
  type WidgetMessage,
} from "./protocol";
import { configUrl, loadSettings, panelUrl, readPublicKey, type WidgetSettings } from "./config";

const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_HEIGHT = 640;
const CORNER_OFFSET = "16px";

/** The corner of the page the button sits in, and the side the panel grows from. */
const CORNERS: Record<WidgetSettings["position"], [string, string]> = {
  "bottom-right": ["bottom", "right"],
  "bottom-left": ["bottom", "left"],
  "top-right": ["top", "right"],
  "top-left": ["top", "left"],
};

/**
 * The styles of the widget, inside its own shadow root.
 *
 * The four position rules address the host with `:host(...)`. The host carries
 * the position as its class, and the host is not part of the shadow tree: a
 * descendant selector cannot match it, so the frame would keep no offsets and
 * open outside the viewport.
 */
const STYLE = `
:host{all:initial}
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:56px;height:56px;padding:0 18px;border:0;border-radius:28px;color:#fff;font:600 15px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.dot{position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#e5484d;display:none}
.unread .dot{display:block}
.frame{position:absolute;width:min(360px,calc(100vw - 32px));height:480px;border:0;border-radius:12px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden}
:host(.bottom-right) .frame{bottom:0;right:0}
:host(.bottom-left) .frame{bottom:0;left:0}
:host(.top-right) .frame{top:0;right:0}
:host(.top-left) .frame{top:0;left:0}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
.fade{animation:fade .18s ease-out}
.slide{animation:slide .22s ease-out}
.scale{animation:scale .18s ease-out}
`;

/** What the loader does with the messages the panel sends. */
export interface WidgetView {
  /** Sends a message to the panel. Never to `*`. */
  post(message: WidgetMessage): void;
  /** The panel closed: hide it and bring the button back. */
  close(): void;
  /** The panel is a different height. */
  resize(height: number): void;
  /** The panel has messages the visitor has not seen. */
  unread(count: number): void;
}

/** A message as it arrives at the page. */
export interface WidgetMessageEvent {
  origin: string;
  data: unknown;
}

/**
 * Takes one message from the panel.
 *
 * A message from another origin is not ours and is ignored — that check is
 * the whole point of the protocol (docs/project.md §9). Returns whether the
 * message was one of ours.
 */
export function handleWidgetMessage(
  view: WidgetView,
  event: WidgetMessageEvent,
  origin: string,
): boolean {
  if (event.origin !== origin) {
    return false;
  }
  if (!isWidgetMessage(event.data)) {
    return false;
  }

  const message = event.data;
  switch (message.type) {
    case WIDGET_READY:
      view.post({ type: WIDGET_OPEN });
      return true;
    case WIDGET_CLOSE:
      view.close();
      return true;
    case WIDGET_RESIZE:
      view.resize(message.height);
      return true;
    case WIDGET_UNREAD:
      view.unread(message.count);
      return true;
    default:
      return false;
  }
}

/**
 * Renders the button and, when it is clicked, the panel.
 *
 * Everything lives in one closed shadow root, so the host page is untouched.
 */
export function mountWidget(
  settings: WidgetSettings,
  origin: string,
  key: string,
  doc: Document,
  win: Window,
): void {
  const host = doc.createElement("div");
  host.id = "askwell-widget";
  host.setAttribute("class", settings.position);
  host.style.setProperty("position", "fixed");
  host.style.setProperty("z-index", "2147483647");
  const [vertical, horizontal] = CORNERS[settings.position];
  host.style.setProperty(vertical, CORNER_OFFSET);
  host.style.setProperty(horizontal, CORNER_OFFSET);

  const shadow = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = STYLE;
  shadow.appendChild(style);

  const button = doc.createElement("button");
  button.setAttribute("class", "btn");
  button.setAttribute("type", "button");
  // The label is text, never markup.
  button.textContent = settings.label;
  button.style.setProperty("background", settings.buttonColor);
  const dot = doc.createElement("span");
  dot.setAttribute("class", "dot");
  button.appendChild(dot);
  shadow.appendChild(button);

  let frame: HTMLIFrameElement | null = null;
  let open = false;

  const view: WidgetView = {
    post(message) {
      frame?.contentWindow?.postMessage(message, origin);
    },
    close() {
      open = false;
      frame?.style.setProperty("display", "none");
      button.style.removeProperty("display");
    },
    resize(height) {
      if (typeof height !== "number" || !Number.isFinite(height)) {
        return;
      }
      const clamped = Math.min(Math.max(height, PANEL_MIN_HEIGHT), PANEL_MAX_HEIGHT);
      frame?.style.setProperty("height", `${clamped}px`);
    },
    unread(count) {
      button.classList.toggle("unread", typeof count === "number" && count > 0);
    },
  };

  button.addEventListener("click", () => {
    if (open) {
      view.post({ type: WIDGET_CLOSE });
      view.close();
      return;
    }

    // The panel is only fetched when the visitor asks for it.
    if (!frame) {
      frame = doc.createElement("iframe");
      frame.setAttribute("class", `frame ${settings.animation}`);
      frame.setAttribute("title", "Askwell chat");
      frame.setAttribute("allow", "clipboard-write");
      frame.src = panelUrl(origin, key);
      shadow.appendChild(frame);
    }

    open = true;
    frame.style.setProperty("display", "block");
    button.style.setProperty("display", "none");
    view.post({ type: WIDGET_OPEN });
  });

  win.addEventListener("message", (event) => {
    handleWidgetMessage(view, event, origin);
  });

  doc.body.appendChild(host);
}

/**
 * Starts the loader.
 *
 * The key comes from the loader's own script tag and the origin from the URL
 * that script was loaded from, so the loader needs no environment variable
 * (docs/project.md §6.5). A key that the route does not know renders
 * nothing at all.
 */
export function init(doc: Document = document, win: Window = window): void {
  const script = doc.currentScript;
  const key = readPublicKey(script);
  const source = script && "src" in script ? script.src : null;
  if (!key || !source) {
    return;
  }

  let origin: string;
  try {
    origin = new URL(source, doc.baseURI).origin;
  } catch {
    return;
  }

  const start = () => {
    void loadSettings(configUrl(origin, key), (input, init) => win.fetch(input, init)).then(
      (settings) => {
        if (!settings) {
          // An unknown key renders nothing: no button, no noise.
          return;
        }
        mountWidget(settings, origin, key, doc, win);
      },
    );
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  start();
}

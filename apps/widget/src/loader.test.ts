import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init, mountWidget } from "./loader";
import type { WidgetSettings } from "./config";

const ORIGIN = "https://app.example.com";
const KEY = "pk_abc123";

const SETTINGS: WidgetSettings = {
  buttonColor: "#0f172a",
  position: "bottom-right",
  label: "Chat with us",
  animation: "slide",
};

function configResponse(config: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ config }),
  } as unknown as Response;
}

/** The color the browser ends up with: the loader sets a hex, the DOM stores rgb. */
function rgb(hex: string): string {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? digits.split("").map((d) => d + d).join("") : digits;
  const parts = [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16));
  return `rgb(${parts.join(", ")})`;
}

/** Clicks the button, so the panel exists, and returns the iframe. */
function openPanel(shadow: { current: ShadowRoot | null }): HTMLIFrameElement | null {
  const button = shadow.current?.querySelector("button");
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return shadow.current?.querySelector("iframe") ?? null;
}

/** The script tag the loader reads its key from. */
function scriptTag(key: string | null): HTMLScriptElement {
  const script = document.createElement("script");
  script.setAttribute("src", `${ORIGIN}/widget.js`);
  if (key !== null) {
    script.setAttribute("data-key", key);
  }
  document.head.appendChild(script);
  Object.defineProperty(document, "currentScript", { configurable: true, value: script });
  return script;
}

/** The shadow root of the widget: the loader keeps it closed, the test needs it. */
function captureShadow(): { current: ShadowRoot | null } {
  const captured: { current: ShadowRoot | null } = { current: null };
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attach(init: ShadowRootInit): ShadowRoot {
    captured.current = attachShadow.call(this, init);
    return captured.current;
  };
  afterEach(() => {
    Element.prototype.attachShadow = attachShadow;
  });
  return captured;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  window.fetch = vi.fn(async () => configResponse(SETTINGS)) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the loader", () => {
  it("reads the key from its own script tag and asks the route on its own origin", async () => {
    scriptTag(KEY);

    init();

    expect(window.fetch).toHaveBeenCalledOnce();
    const [url] = (window.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(`${ORIGIN}/api/widget/config?key=${KEY}`);
  });

  it("renders the button in its own shadow root", async () => {
    const shadow = captureShadow();
    scriptTag(KEY);

    init();
    await vi.waitFor(() => expect(shadow.current).not.toBeNull());

    const host = document.body.querySelector("#askwell-widget");
    expect(host).not.toBeNull();
    // The shadow root is closed: nothing outside can reach into it.
    expect(host?.shadowRoot).toBeNull();

    const button = shadow.current?.querySelector("button");
    expect(button?.textContent).toContain(SETTINGS.label);
    expect(button?.getAttribute("style")).toContain(rgb(SETTINGS.buttonColor));
    // The position comes from the config.
    expect(host?.getAttribute("class")).toBe(SETTINGS.position);
    expect(host?.getAttribute("style")).toContain("bottom: 16px");
    expect(host?.getAttribute("style")).toContain("right: 16px");
  });

  it("opens the panel on the same origin with the configured animation", async () => {
    const shadow = captureShadow();
    scriptTag(KEY);

    init();
    await vi.waitFor(() => expect(shadow.current).not.toBeNull());

    const button = shadow.current?.querySelector("button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const frame = shadow.current?.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(`${ORIGIN}/embed?key=${KEY}`);
    expect(frame?.getAttribute("class")).toContain(SETTINGS.animation);
  });

  it("renders nothing when the key is unknown", async () => {
    window.fetch = vi.fn(async () =>
      configResponse({ error: { code: "not_found", message: "No such project." } }, 404),
    ) as unknown as typeof fetch;
    scriptTag("pk_unknown");

    init();
    await vi.waitFor(() => expect(window.fetch).toHaveBeenCalled());

    expect(document.body.querySelector("#askwell-widget")).toBeNull();
  });

  it("renders nothing when the script tag has no key", () => {
    scriptTag(null);

    init();

    expect(window.fetch).not.toHaveBeenCalled();
    expect(document.body.querySelector("#askwell-widget")).toBeNull();
  });
});

describe("the messages", () => {
  it("ignores a message from another origin", async () => {
    const shadow = captureShadow();
    mountWidget(SETTINGS, ORIGIN, KEY, document, window);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example",
        data: { type: "askwell:unread", count: 3 },
      }),
    );

    const button = shadow.current?.querySelector("button");
    expect(button?.classList.contains("unread")).toBe(false);
  });

  it("takes the unread count from the panel", async () => {
    const shadow = captureShadow();
    mountWidget(SETTINGS, ORIGIN, KEY, document, window);

    window.dispatchEvent(
      new MessageEvent("message", { origin: ORIGIN, data: { type: "askwell:unread", count: 2 } }),
    );

    const button = shadow.current?.querySelector("button");
    expect(button?.classList.contains("unread")).toBe(true);
  });

  it("sizes the panel to the height the panel reports", async () => {
    const shadow = captureShadow();
    mountWidget(SETTINGS, ORIGIN, KEY, document, window);
    const frame = openPanel(shadow);

    window.dispatchEvent(
      new MessageEvent("message", { origin: ORIGIN, data: { type: "askwell:resize", height: 700 } }),
    );

    expect(frame?.getAttribute("style")).toContain("640px");
  });

  it("closes the panel when the panel says so", async () => {
    const shadow = captureShadow();
    mountWidget(SETTINGS, ORIGIN, KEY, document, window);
    const frame = openPanel(shadow);

    window.dispatchEvent(
      new MessageEvent("message", { origin: ORIGIN, data: { type: "askwell:close" } }),
    );

    expect(frame?.getAttribute("style")).toContain("display: none");
  });

  it("never sends to a wildcard origin", async () => {
    const shadow = captureShadow();
    mountWidget(SETTINGS, ORIGIN, KEY, document, window);
    const frame = openPanel(shadow);
    const post = vi.spyOn(frame?.contentWindow as Window, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", { origin: ORIGIN, data: { type: "askwell:ready" } }),
    );

    expect(post).toHaveBeenCalled();
    for (const call of post.mock.calls) {
      expect(call[1]).toBe(ORIGIN);
      expect(call[1]).not.toBe("*");
    }
  });
});

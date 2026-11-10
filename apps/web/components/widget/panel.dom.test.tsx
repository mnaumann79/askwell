// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANNED_REPLY, Panel } from "./panel";
import { visitorIdKey } from "./visitor-id";

/**
 * The panel in a browser (jsdom).
 *
 * The protocol with the loader: the panel tells the page that embeds it that
 * it is ready, and it only takes the messages of that page (docs/project.md
 * §9).
 */

const PARENT = "https://customer.example.com";
const KEY = "pk_0123456789abcdef0123456789abcdef";

const CONFIG = {
  config: {
    buttonColor: "#111111",
    position: "bottom-right",
    label: "Chat",
    animation: "fade",
    headerText: "Askwell",
    showBadge: true,
  },
};

/** The page that embeds the panel, and the messages it sends. */
function stubParent(): { postMessage: ReturnType<typeof vi.fn> } {
  const postMessage = vi.fn();
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
  Object.defineProperty(document, "referrer", { configurable: true, value: `${PARENT}/pricing` });

  return { postMessage };
}

/** The answer of the config route. */
function configAnswer(status: number, body: unknown = CONFIG): void {
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

/** The answer of a route that is not there: the HTML 404 of the framework. */
function missingRoute(): void {
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => {
      throw new SyntaxError("Unexpected token '<'");
    },
  })) as unknown as typeof fetch;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Panel publicKey={KEY} />);
  });

  return { container, root };
}

/** Waits for something to happen, without guessing how long it takes. */
async function until(condition: () => boolean, timeout = 3000): Promise<void> {
  const started = Date.now();

  while (!condition()) {
    if (Date.now() - started > timeout) {
      throw new Error("the panel did not get there in time");
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

/** Writes in the input the way a person does. */
async function type(container: HTMLElement, text: string): Promise<void> {
  const input = container.querySelector("input");
  if (!input) {
    throw new Error("the panel has no input");
  }

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, text);

  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Sends what is in the input. */
async function send(container: HTMLElement): Promise<void> {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("the panel has no form");
  }

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  // React only lets `act` run when it knows it is in a test.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  configAnswer(200);
  window.localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the panel in a browser", () => {
  it("tells the page that embeds it that it is ready", async () => {
    const { postMessage } = stubParent();

    await mount();

    expect(postMessage).toHaveBeenCalledWith({ type: "askwell:ready" }, PARENT);
  });

  it("never sends to a wildcard origin", async () => {
    const { postMessage } = stubParent();

    await mount();

    for (const call of postMessage.mock.calls) {
      expect(call[1]).toBe(PARENT);
      expect(call[1]).not.toBe("*");
    }
  });

  it("ignores a message from another origin", async () => {
    stubParent();
    const { container } = await mount();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://evil.example",
          data: { type: "askwell:close" },
        }),
      );
    });

    expect(container.querySelector("[data-open]")?.getAttribute("data-open")).toBe("true");
  });

  it("takes a message from the page that embeds it", async () => {
    stubParent();
    const { container } = await mount();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: PARENT, data: { type: "askwell:close" } }),
      );
    });

    expect(container.querySelector("[data-open]")?.getAttribute("data-open")).toBe("false");
  });

  it("shows the header text and the badge of the config", async () => {
    stubParent();
    const { container } = await mount();

    expect(container.textContent).toContain("Askwell");
    expect(container.textContent).toContain("Powered by");
  });

  it("shows the empty state before the first question", async () => {
    stubParent();
    const { container } = await mount();

    expect(container.querySelector('[data-state="empty"]')).not.toBeNull();
  });

  it("keeps the visitor id in its own storage, under the project", async () => {
    stubParent();
    await mount();

    expect(window.localStorage.getItem(visitorIdKey(KEY))).toBeTruthy();
  });

  it("shows the visitor's message, then the typing state, then the reply", async () => {
    stubParent();
    const { container } = await mount();

    await type(container, "Does it work on mobile?");
    await send(container);

    expect(container.querySelector('[data-role="visitor"]')?.textContent).toBe(
      "Does it work on mobile?",
    );
    expect(container.querySelector("[data-typing]")).not.toBeNull();

    await until(() => container.querySelector('[data-role="bot"]') !== null);

    expect(container.querySelector('[data-role="bot"]')?.textContent).toBe(CANNED_REPLY);
    expect(container.querySelector("[data-typing]")).toBeNull();
  });

  it("renders a message as text, never as HTML", async () => {
    stubParent();
    const { container } = await mount();

    await type(container, "<img src=x onerror=alert(1)>");
    await send(container);

    const message = container.querySelector('[data-role="visitor"]');
    expect(message?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(message?.querySelector("img")).toBeNull();
  });

  it("counts the replies that arrive while the panel is closed", async () => {
    const { postMessage } = stubParent();
    const { container } = await mount();

    // The loader closes the panel.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: PARENT, data: { type: "askwell:close" } }),
      );
    });

    await type(container, "Does it work on mobile?");
    await send(container);

    await until(() => postMessage.mock.calls.some((call) => call[0].type === "askwell:unread"));

    const unread = postMessage.mock.calls.find((call) => call[0].type === "askwell:unread");
    expect(unread?.[0]).toEqual({ type: "askwell:unread", count: 1 });
    expect(unread?.[1]).toBe(PARENT);
  });

  it("tells the loader how tall it is", async () => {
    const { postMessage } = stubParent();

    await mount();

    const resize = postMessage.mock.calls.find((call) => call[0].type === "askwell:resize");
    expect(resize).toBeDefined();
    expect(typeof resize?.[0].height).toBe("number");
  });

  it("closes itself when the close button is pressed", async () => {
    const { postMessage } = stubParent();
    const { container } = await mount();

    const button = container.querySelector('button[aria-label="Close the chat"]');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "askwell:close" }, PARENT);
    expect(container.querySelector("[data-open]")?.getAttribute("data-open")).toBe("false");
  });

  it("falls back to the default config while the config route is not there", async () => {
    missingRoute();
    stubParent();

    const { container } = await mount();

    expect(container.querySelector('[data-state="error"]')).toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("shows the error state when the key is unknown", async () => {
    configAnswer(404, { error: { code: "not_found", message: "No such project." } });
    stubParent();

    const { container } = await mount();

    expect(container.querySelector('[data-state="error"]')).not.toBeNull();
  });

  it("shows the error state when the config route fails", async () => {
    configAnswer(500);
    stubParent();

    const { container } = await mount();

    expect(container.querySelector('[data-state="error"]')).not.toBeNull();
  });
});

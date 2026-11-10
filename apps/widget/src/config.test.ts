import { describe, expect, it, vi } from "vitest";
import { configUrl, loadSettings, panelUrl, readPublicKey } from "./config";

function element(attributes: Record<string, string>): { getAttribute(name: string): string | null } {
  return {
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
  };
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SETTINGS = {
  buttonColor: "#111111",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
};

describe("the public key", () => {
  it("is read from the script tag", () => {
    expect(readPublicKey(element({ "data-key": "pk_abc123" }))).toBe("pk_abc123");
  });

  it("is trimmed", () => {
    expect(readPublicKey(element({ "data-key": "  pk_abc123  " }))).toBe("pk_abc123");
  });

  it("is nothing when the script tag has no key", () => {
    expect(readPublicKey(element({}))).toBeNull();
    expect(readPublicKey(element({ "data-key": "   " }))).toBeNull();
    expect(readPublicKey(null)).toBeNull();
  });
});

describe("the urls", () => {
  it("are built on the origin of the script itself", () => {
    expect(configUrl("https://app.example.com", "pk_abc123")).toBe(
      "https://app.example.com/api/widget/config?key=pk_abc123",
    );
    expect(panelUrl("https://app.example.com", "pk_abc123")).toBe(
      "https://app.example.com/embed?key=pk_abc123",
    );
  });

  it("encode the key", () => {
    expect(configUrl("https://app.example.com", "pk a&b")).toBe(
      "https://app.example.com/api/widget/config?key=pk%20a%26b",
    );
  });
});

describe("the config", () => {
  it("is read from the route", async () => {
    const fetchImpl = vi.fn(async () => response(200, { config: SETTINGS }));

    const settings = await loadSettings("https://app.example.com/api/widget/config?key=pk_abc", fetchImpl);

    expect(settings).toEqual(SETTINGS);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("is nothing when the key is unknown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const settings = await loadSettings(
      "https://app.example.com/api/widget/config?key=pk_abc",
      async () => response(404, { error: { code: "not_found", message: "No such project." } }),
    );

    expect(settings).toBeNull();
    // An unknown key is quiet: no button, no noise.
    expect(warn).not.toHaveBeenCalled();
  });

  it("is nothing when the database refuses, and says so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const settings = await loadSettings(
      "https://app.example.com/api/widget/config?key=pk_abc",
      async () => response(502, "upstream connect error or disconnect/reset before headers."),
    );

    expect(settings).toBeNull();
    // A 502 is not a bad key: it is our side failing (docs/runbook.md §1.5).
    expect(warn).toHaveBeenCalledOnce();
  });

  it("is nothing when the call does not get through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const settings = await loadSettings(
      "https://app.example.com/api/widget/config?key=pk_abc",
      async () => {
        throw new Error("network");
      },
    );

    expect(settings).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("is nothing when the answer is not a config", async () => {
    const settings = await loadSettings(
      "https://app.example.com/api/widget/config?key=pk_abc",
      async () => response(200, { config: { label: 42 } }),
    );

    expect(settings).toBeNull();
  });
});

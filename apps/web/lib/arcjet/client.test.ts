import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { arcjetMock, slidingWindowMock, detectPromptInjectionMock } = vi.hoisted(() => {
  const slidingWindow = vi.fn(() => ["rate-limit"]);
  const detectPromptInjection = vi.fn(() => ["injection"]);

  // `withRule()` gives a client of its own that shares the cache of the
  // client it comes from.
  const client = {
    protect: vi.fn(),
    withRule: vi.fn(() => ({ protect: vi.fn(), withRule: vi.fn() })),
  };

  return {
    arcjetMock: vi.fn(() => client),
    slidingWindowMock: slidingWindow,
    detectPromptInjectionMock: detectPromptInjection,
  };
});

vi.mock("@arcjet/next", () => ({
  default: arcjetMock,
  slidingWindow: slidingWindowMock,
  detectPromptInjection: detectPromptInjectionMock,
}));
// `server-only` throws outside a React Server Component. Next.js resolves it
// to an empty module there; the test needs the same.
vi.mock("server-only", () => ({}));

const ARCJET_KEY = "ajkey_a_test_key";

/** The client module, fresh for every test. */
async function loadClient() {
  vi.resetModules();
  return import("./client");
}

describe("arcjetClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARCJET_KEY = ARCJET_KEY;
  });

  afterEach(() => {
    delete process.env.ARCJET_KEY;
  });

  it("limits to 20 requests a minute, by the key, the IP and the path", async () => {
    const { arcjetClients } = await loadClient();

    arcjetClients();

    // The key is the public key of the project, the IP is the address of
    // the caller and the path gives each public route its own budget.
    expect(slidingWindowMock).toHaveBeenCalledWith({
      mode: "LIVE",
      interval: "60s",
      max: 20,
      characteristics: ["ip.src", "userId", "http.request.uri.path"],
    });
  });

  it("checks the injection on the chat client only", async () => {
    const { arcjetClients } = await loadClient();

    const clients = arcjetClients();

    expect(detectPromptInjectionMock).toHaveBeenCalledWith({ mode: "LIVE" });
    expect(clients?.base).not.toBe(clients?.chat);
  });

  it("builds the clients once for one key", async () => {
    const { arcjetClients } = await loadClient();

    const first = arcjetClients();
    const second = arcjetClients();

    expect(second).toBe(first);
    expect(arcjetMock).toHaveBeenCalledTimes(1);
  });

  it("builds the clients again when the key changes", async () => {
    const { arcjetClients } = await loadClient();

    arcjetClients();
    process.env.ARCJET_KEY = "ajkey_another_key";
    arcjetClients();

    expect(arcjetMock).toHaveBeenCalledTimes(2);
  });

  it("has no client without a key, and says so once", async () => {
    const { arcjetClients } = await loadClient();
    delete process.env.ARCJET_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(arcjetClients()).toBeNull();
    expect(arcjetClients()).toBeNull();

    // The message is there, so nobody misses that the routes are not
    // protected.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("ARCJET_KEY");
    warn.mockRestore();
  });
});

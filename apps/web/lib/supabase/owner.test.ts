import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnerClient } from "./owner";

const { createClientMock, authMock, getTokenMock } = vi.hoisted(() => ({
  createClientMock:
    vi.fn<(url: string, key: string, options: SupabaseClientOptions<"public">) => unknown>(),
  authMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_a_publishable_value";
const CLERK_TOKEN = "clerk.session.token";
const SECRET_KEY = "sb_secret_a_secret_value";

function firstCall(): [string, string, SupabaseClientOptions<"public">] {
  const call = createClientMock.mock.calls[0];
  if (!call) {
    throw new Error("createClient was not called");
  }
  return call;
}

describe("createOwnerClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
    getTokenMock.mockResolvedValue(CLERK_TOKEN);
    authMock.mockResolvedValue({ getToken: getTokenMock });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("reads the url and the publishable key from the environment", async () => {
    await createOwnerClient();

    const [url, key] = firstCall();
    expect(url).toBe(URL);
    expect(key).toBe(PUBLISHABLE_KEY);
  });

  it("sends the Clerk session token as the access token", async () => {
    await createOwnerClient();

    const [, , options] = firstCall();
    const token = await options.accessToken?.();
    expect(token).toBe(CLERK_TOKEN);
  });

  it("fetches a fresh token for every request", async () => {
    await createOwnerClient();

    const [, , options] = firstCall();
    getTokenMock.mockResolvedValue("a-newer-clerk-token");

    expect(await options.accessToken?.()).toBe("a-newer-clerk-token");
  });

  it("never uses the service key", async () => {
    await createOwnerClient();

    const [, key] = firstCall();
    expect(key).not.toBe(SECRET_KEY);
  });

  it("throws when there is no signed-in user", async () => {
    getTokenMock.mockResolvedValue(null);

    await expect(createOwnerClient()).rejects.toThrow(/signed-in user/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when the publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    await expect(createOwnerClient()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("never puts the key in the error message", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    let message = "";
    try {
      await createOwnerClient();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(PUBLISHABLE_KEY);
    expect(message).not.toContain(CLERK_TOKEN);
    expect(message).not.toContain(SECRET_KEY);
  });
});

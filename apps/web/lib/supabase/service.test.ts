import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "./service";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock:
    vi.fn<(url: string, key: string, options: SupabaseClientOptions<"public">) => unknown>(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
// `server-only` throws outside a React Server Component. Next.js resolves it
// to an empty module there; the test needs the same.
vi.mock("server-only", () => ({}));

const URL = "https://project-ref.supabase.co";
const SECRET_KEY = "sb_secret_a_secret_value";

function firstCall(): [string, string, SupabaseClientOptions<"public">] {
  const call = createClientMock.mock.calls[0];
  if (!call) {
    throw new Error("createClient was not called");
  }
  return call;
}

describe("createServiceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("reads the url and the secret key from the environment", () => {
    createServiceClient();

    const [url, key] = firstCall();
    expect(url).toBe(URL);
    expect(key).toBe(SECRET_KEY);
  });

  it("does not keep a session in the browser", () => {
    createServiceClient();

    const [, , options] = firstCall();
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  });

  it("throws a clear error when the secret key is missing", () => {
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => createServiceClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when the url is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => createServiceClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("never puts the key in the error message", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    let message = "";
    try {
      createServiceClient();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(SECRET_KEY);
    expect(message).not.toContain("sb_secret");
  });
});

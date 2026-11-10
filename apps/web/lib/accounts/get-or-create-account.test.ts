import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateAccount } from "./get-or-create-account";

const { createClientMock, authMock, getTokenMock } = vi.hoisted(() => ({
  createClientMock:
    vi.fn<(url: string, key: string, options: SupabaseClientOptions<"public">) => unknown>(),
  authMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
// `server-only` throws outside a React Server Component. Next.js resolves it
// to an empty module there; the test needs the same.
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_a_publishable_value";
const SECRET_KEY = "sb_secret_a_secret_value";
const CLERK_TOKEN = "clerk.session.token";

type AccountPayload = { clerk_user_id: string; plan: string };
type AccountRow = { clerk_user_id: string; plan: string; created_at: string };
type UpsertOptions = { onConflict?: string; ignoreDuplicates?: boolean };

type FakeCall = {
  table: string;
  op: "select" | "upsert";
  columns?: string;
  payload?: AccountPayload;
  options?: UpsertOptions;
  filters: [string, unknown][];
};

type FakeResult = { data: AccountRow | null; error: { message: string; code?: string } | null };

type FakeBuilder = {
  select(columns: string): FakeBuilder;
  upsert(payload: AccountPayload, options: UpsertOptions): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  maybeSingle(): Promise<FakeResult>;
};

/** A stand-in for the Supabase client that records the queries it is given. */
function fakeClient(respond: (call: FakeCall, index: number) => FakeResult) {
  const calls: FakeCall[] = [];

  const client = {
    from(table: string): FakeBuilder {
      const call: FakeCall = { table, op: "select", filters: [] };
      calls.push(call);

      const builder: FakeBuilder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        upsert(payload, options) {
          call.op = "upsert";
          call.payload = payload;
          call.options = options;
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(respond(call, calls.length - 1));
        },
      };

      return builder;
    },
  };

  return { client, calls };
}

/**
 * Hands the module one fake client per key: the publishable key is the owner
 * client, the secret key is the service client.
 */
function useClients(respond: {
  owner?: (call: FakeCall, index: number) => FakeResult;
  service?: (call: FakeCall, index: number) => FakeResult;
}) {
  const owner = fakeClient(respond.owner ?? (() => ({ data: null, error: null })));
  const service = fakeClient(respond.service ?? (() => ({ data: null, error: null })));

  createClientMock.mockImplementation((_url: string, key: string) =>
    key === SECRET_KEY ? service.client : owner.client,
  );

  return { owner, service };
}

/** The first query a fake client was given. */
function first(calls: FakeCall[]): FakeCall {
  const call = calls[0];
  if (!call) {
    throw new Error("The client was not called");
  }
  return call;
}

const ROW: AccountRow = {
  clerk_user_id: "user_123",
  plan: "free",
  created_at: "2026-11-10T10:00:00.000Z",
};

describe("getOrCreateAccount", () => {
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

  it("creates the account on the first sign-in", async () => {
    const { service } = useClients({
      owner: () => ({ data: null, error: null }),
      service: () => ({ data: ROW, error: null }),
    });

    const account = await getOrCreateAccount("user_123");

    expect(account).toEqual({
      clerkUserId: "user_123",
      plan: "free",
      createdAt: ROW.created_at,
    });
    expect(service.calls).toHaveLength(1);
    expect(first(service.calls).table).toBe("accounts");
  });

  it("reads with the owner client and writes with the service client", async () => {
    const { owner, service } = useClients({
      owner: () => ({ data: null, error: null }),
      service: () => ({ data: ROW, error: null }),
    });

    await getOrCreateAccount("user_123");

    // The owner client is built with the publishable key, the service client
    // with the secret key.
    const keys = createClientMock.mock.calls.map((call) => call[1]);
    expect(keys).toContain(PUBLISHABLE_KEY);
    expect(keys).toContain(SECRET_KEY);
    expect(keys).not.toContain(SECRET_KEY + " ");

    // The read goes through the owner client and is scoped to the owner.
    expect(first(owner.calls).op).toBe("select");
    expect(first(owner.calls).filters).toEqual([["clerk_user_id", "user_123"]]);

    // The write goes through the service client.
    expect(first(service.calls).op).toBe("upsert");
  });

  it("writes the row with the plan free", async () => {
    const { service } = useClients({
      owner: () => ({ data: null, error: null }),
      service: () => ({ data: ROW, error: null }),
    });

    await getOrCreateAccount("user_123");

    expect(first(service.calls).payload).toEqual({ clerk_user_id: "user_123", plan: "free" });
  });

  it("writes the row in a way that cannot create a second one", async () => {
    const { service } = useClients({
      owner: () => ({ data: null, error: null }),
      service: () => ({ data: ROW, error: null }),
    });

    await getOrCreateAccount("user_123");

    expect(first(service.calls).options).toEqual({
      onConflict: "clerk_user_id",
      ignoreDuplicates: true,
    });
  });

  it("does not write again when the account already exists", async () => {
    const { owner, service } = useClients({
      owner: () => ({ data: ROW, error: null }),
    });

    const account = await getOrCreateAccount("user_123");

    expect(account.plan).toBe("free");
    expect(owner.calls).toHaveLength(1);
    expect(service.calls).toHaveLength(0);
  });

  it("does not write over an account that is already on the pro plan", async () => {
    const { service } = useClients({
      owner: () => ({ data: { ...ROW, plan: "pro" }, error: null }),
    });

    const account = await getOrCreateAccount("user_123");

    expect(account.plan).toBe("pro");
    expect(service.calls).toHaveLength(0);
  });

  it("creates one row when two first requests race", async () => {
    // The first read finds nothing and the write does nothing, because the
    // other request got there first. The read back finds the row.
    let reads = 0;
    const { owner, service } = useClients({
      owner: () => (reads++ === 0 ? { data: null, error: null } : { data: ROW, error: null }),
      service: () => ({ data: null, error: null }),
    });

    const account = await getOrCreateAccount("user_123");

    expect(account.clerkUserId).toBe("user_123");
    expect(service.calls).toHaveLength(1);
    expect(owner.calls).toHaveLength(2);
  });

  it("surfaces the error when the write fails", async () => {
    useClients({
      owner: () => ({ data: null, error: null }),
      service: () => ({ data: null, error: { message: "the database said no" } }),
    });

    await expect(getOrCreateAccount("user_123")).rejects.toThrow(/the database said no/);
  });

  it("surfaces the error when the read fails", async () => {
    useClients({
      owner: () => ({ data: null, error: { message: "the read was refused" } }),
    });

    await expect(getOrCreateAccount("user_123")).rejects.toThrow(/the read was refused/);
  });

  it("refuses a row with a plan it does not know", async () => {
    useClients({
      owner: () => ({ data: { ...ROW, plan: "gold" }, error: null }),
    });

    await expect(getOrCreateAccount("user_123")).rejects.toThrow(/Unknown plan/);
  });

  it("refuses an empty Clerk user id", async () => {
    await expect(getOrCreateAccount("")).rejects.toThrow(/Clerk user id/);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

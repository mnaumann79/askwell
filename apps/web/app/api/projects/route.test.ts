import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

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

const USER_ID = "user_123";
const PROJECT_ID = "3f2b1a44-9c1e-4a5b-8d2e-1f0a2b3c4d5e";
const PUBLIC_KEY = `pk_${"a".repeat(32)}`;

const PROJECT_ROW = {
  id: PROJECT_ID,
  name: "Support",
  public_key: PUBLIC_KEY,
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-10T12:00:00+00:00",
};

const ACCOUNT_ROW = {
  clerk_user_id: USER_ID,
  plan: "free",
  created_at: "2026-11-10T10:00:00.000Z",
};

type FakeCall = {
  table: string;
  op: "select" | "update" | "delete" | "upsert" | "rpc";
  columns?: string;
  payload?: unknown;
  filters: [string, unknown][];
  fn?: string;
  args?: Record<string, unknown>;
};

type FakeError = { message: string; code?: string; hint?: string; details?: string | null };

type FakeResult = { data: unknown; error: FakeError | null };

type FakeBuilder = {
  select(columns: string): FakeBuilder;
  order(column: string, options: { ascending: boolean }): FakeBuilder;
  update(payload: unknown): FakeBuilder;
  delete(): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  maybeSingle(): Promise<FakeResult>;
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

/** A stand-in for the Supabase client that records the queries it is given. */
function fakeClient(respond: (call: FakeCall) => FakeResult) {
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
        order() {
          return builder;
        },
        update(payload) {
          call.op = "update";
          call.payload = payload;
          return builder;
        },
        delete() {
          call.op = "delete";
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(respond(call));
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(respond(call)).then(onfulfilled, onrejected);
        },
      };

      return builder;
    },

    rpc(fn: string, args: Record<string, unknown>): Promise<FakeResult> {
      const call: FakeCall = { table: "rpc", op: "rpc", fn, args, filters: [] };
      calls.push(call);

      return Promise.resolve(respond(call));
    },
  };

  return { client, calls };
}

/**
 * Hands the module one fake client per key: the publishable key is the owner
 * client, the secret key is the service client.
 */
function useClients(respond: {
  owner?: (call: FakeCall) => FakeResult;
  service?: (call: FakeCall) => FakeResult;
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

/** A request with a JSON body. */
function jsonRequest(body: unknown): Request {
  return new Request("https://app.test/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The default answer: the account, the projects and a created project. */
function respondTo(call: FakeCall): FakeResult {
  if (call.table === "accounts") {
    return { data: ACCOUNT_ROW, error: null };
  }

  if (call.table === "rpc") {
    return { data: PROJECT_ROW, error: null };
  }

  return { data: [PROJECT_ROW], error: null };
}

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
    getTokenMock.mockResolvedValue(CLERK_TOKEN);
    authMock.mockResolvedValue({ userId: USER_ID, getToken: getTokenMock });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("lists the owner's projects", async () => {
    useClients({ owner: respondTo, service: respondTo });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toEqual([
      {
        id: PROJECT_ID,
        name: "Support",
        publicKey: PUBLIC_KEY,
        messagesUsed: 0,
        periodStart: "2026-11-01T00:00:00+00:00",
        createdAt: "2026-11-10T12:00:00+00:00",
      },
    ]);
  });

  it("reads through the owner client and does not filter by owner itself", async () => {
    // The scoping is RLS's job: the route asks for the owner's rows and
    // filters nothing, because a manual filter with the service client would
    // be the thing §9 forbids.
    const { owner, service } = useClients({ owner: respondTo, service: respondTo });

    await GET();

    const keys = createClientMock.mock.calls.map((call) => call[1]);
    expect(keys).toEqual([PUBLISHABLE_KEY]);
    expect(first(owner.calls).table).toBe("projects");
    expect(first(owner.calls).filters).toEqual([]);
    expect(service.calls).toHaveLength(0);
  });

  it("answers 401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: getTokenMock });
    useClients({ owner: respondTo, service: respondTo });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
    getTokenMock.mockResolvedValue(CLERK_TOKEN);
    authMock.mockResolvedValue({ userId: USER_ID, getToken: getTokenMock });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("creates a project with a public key", async () => {
    useClients({ owner: respondTo, service: respondTo });

    const response = await POST(jsonRequest({ name: "Support" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project.name).toBe("Support");
    expect(body.project.publicKey).toMatch(/^pk_[0-9a-f]{32}$/);
  });

  it("hands the free limit and the default widget config to the function", async () => {
    const { service } = useClients({ owner: respondTo, service: respondTo });

    await POST(jsonRequest({ name: "Support" }));

    const call = first(service.calls);
    expect(call.op).toBe("rpc");
    expect(call.fn).toBe("create_project");
    expect(call.args).toEqual({
      p_owner_id: USER_ID,
      p_name: "Support",
      p_max_projects: 1,
      p_widget_config: DEFAULT_WIDGET_CONFIG,
    });
  });

  it("hands the pro limit to the function", async () => {
    const { service } = useClients({
      owner: (call) =>
        call.table === "accounts"
          ? { data: { ...ACCOUNT_ROW, plan: "pro" }, error: null }
          : respondTo(call),
      service: respondTo,
    });

    await POST(jsonRequest({ name: "Support" }));

    expect(first(service.calls).args).toMatchObject({ p_max_projects: 5 });
  });

  it("refuses the second project on the free plan with 409", async () => {
    useClients({
      owner: respondTo,
      service: (call) =>
        call.table === "rpc"
          ? {
              data: null,
              error: {
                code: "P0001",
                message: "project limit reached for plan",
                details: null,
                hint: "plan_limit_projects",
              },
            }
          : respondTo(call),
    });

    const response = await POST(jsonRequest({ name: "Second" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
  });

  it("never guesses a hint it does not know", async () => {
    useClients({
      owner: respondTo,
      service: (call) =>
        call.table === "rpc"
          ? { data: null, error: { code: "P0001", message: "?", hint: "a_hint_nobody_wrote" } }
          : respondTo(call),
    });

    const response = await POST(jsonRequest({ name: "Second" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("answers 400 for a name that is missing", async () => {
    useClients({ owner: respondTo, service: respondTo });

    const response = await POST(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });

  it("answers 401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: getTokenMock });
    useClients({ owner: respondTo, service: respondTo });

    const response = await POST(jsonRequest({ name: "Support" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

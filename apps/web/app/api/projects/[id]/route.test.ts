import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./route";

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

type FakeCall = {
  table: string;
  op: "select" | "update" | "delete" | "upsert" | "rpc";
  columns?: string;
  payload?: unknown;
  filters: [string, unknown][];
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
  };

  return { client, calls };
}

/**
 * Hands the module one fake client per key: the publishable key is the owner
 * client, the secret key is the service client.
 */
function useClients(respond: { owner?: (call: FakeCall) => FakeResult }) {
  const owner = fakeClient(respond.owner ?? (() => ({ data: null, error: null })));

  createClientMock.mockImplementation((_url: string, _key: string) => owner.client);

  return { owner };
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
function jsonRequest(body: unknown, method = "PATCH"): Request {
  return new Request(`https://app.test/api/projects/${PROJECT_ID}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The params of the route. */
function params(id = PROJECT_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** The default answer: the rename lands and the delete removes the row. */
function respondTo(call: FakeCall): FakeResult {
  if (call.op === "update") {
    return { data: { ...PROJECT_ROW, name: "Sales" }, error: null };
  }

  if (call.op === "delete") {
    return { data: { id: PROJECT_ID }, error: null };
  }

  return { data: [PROJECT_ROW], error: null };
}

describe("PATCH /api/projects/:id", () => {
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

  it("renames the project", async () => {
    useClients({ owner: respondTo });

    const response = await PATCH(jsonRequest({ name: "Sales" }), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.name).toBe("Sales");
  });

  it("sends the name and nothing else", async () => {
    // The column-level grant lets the owner update the name and no other
    // column, and the route must not send anything else either.
    const { owner } = useClients({ owner: respondTo });

    await PATCH(jsonRequest({ name: "Sales" }), params());

    const call = first(owner.calls);
    expect(call.op).toBe("update");
    expect(call.payload).toEqual({ name: "Sales" });
    expect(call.filters).toEqual([["id", PROJECT_ID]]);
  });

  it("answers 404 for a project of another owner", async () => {
    // The update matches no row, because RLS limits the rows to the owner's
    // own projects. The answer must not say the project exists.
    useClients({ owner: () => ({ data: null, error: null }) });

    const response = await PATCH(jsonRequest({ name: "Sales" }), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 404 for an id that is not a project id", async () => {
    useClients({ owner: respondTo });

    const response = await PATCH(jsonRequest({ name: "Sales" }), params("not-a-uuid"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 400 for a name that is missing", async () => {
    useClients({ owner: respondTo });

    const response = await PATCH(jsonRequest({}), params());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });

  it("answers 401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: getTokenMock });
    useClients({ owner: respondTo });

    const response = await PATCH(jsonRequest({ name: "Sales" }), params());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/:id", () => {
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

  it("deletes the project", async () => {
    const { owner } = useClients({ owner: respondTo });

    const response = await DELETE(jsonRequest({}, "DELETE"), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: PROJECT_ID });

    const call = first(owner.calls);
    expect(call.op).toBe("delete");
    expect(call.filters).toEqual([["id", PROJECT_ID]]);
  });

  it("answers 404 for a project of another owner", async () => {
    useClients({ owner: () => ({ data: null, error: null }) });

    const response = await DELETE(jsonRequest({}, "DELETE"), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 404 for an id that is not a project id", async () => {
    useClients({ owner: respondTo });

    const response = await DELETE(jsonRequest({}, "DELETE"), params("not-a-uuid"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: getTokenMock });
    useClients({ owner: respondTo });

    const response = await DELETE(jsonRequest({}, "DELETE"), params());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

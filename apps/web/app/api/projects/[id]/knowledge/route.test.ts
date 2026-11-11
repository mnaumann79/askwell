import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../../../../../lib/knowledge/process";
import { POST } from "./route";

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
const SOURCE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const ACCOUNT_ROW = {
  clerk_user_id: USER_ID,
  plan: "free",
  created_at: "2026-11-10T12:00:00+00:00",
};

const SOURCE_ROW = {
  id: SOURCE_ID,
  project_id: PROJECT_ID,
  title: "Our prices",
  type: "text",
  storage_key: null,
  status: "uploading",
  created_at: "2026-11-11T09:30:00+00:00",
};

type FakeCall = {
  table: string;
  op: "select" | "update" | "insert" | "delete" | "rpc";
  name?: string;
  columns?: string;
  payload?: unknown;
  args?: Record<string, unknown>;
  filters: [string, unknown][];
};

type FakeError = { message: string; code?: string; hint?: string; details?: string | null };

type FakeResult = { data: unknown; error: FakeError | null };

type FakeBuilder = {
  select(columns: string): FakeBuilder;
  update(payload: unknown): FakeBuilder;
  insert(payload: unknown): FakeBuilder;
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
        update(payload) {
          call.op = "update";
          call.payload = payload;
          return builder;
        },
        insert(payload) {
          call.op = "insert";
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
    rpc(name: string, args: Record<string, unknown>): Promise<FakeResult> {
      const call: FakeCall = { table: "rpc", op: "rpc", name, args, filters: [] };
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
    key === PUBLISHABLE_KEY ? owner.client : service.client,
  );

  return { owner, service };
}

/** The default answer of the owner client: the project and the account. */
function respondToOwner(call: FakeCall): FakeResult {
  if (call.table === "projects") {
    return { data: { id: PROJECT_ID }, error: null };
  }

  if (call.table === "accounts") {
    return { data: ACCOUNT_ROW, error: null };
  }

  return { data: null, error: null };
}

/** The default answer of the service client: the reserved source. */
function respondToService(call: FakeCall): FakeResult {
  if (call.op === "rpc") {
    return { data: SOURCE_ROW, error: null };
  }

  return { data: null, error: null };
}

/** The calls the service client was given for one table. */
function callsTo(calls: FakeCall[], table: string): FakeCall[] {
  return calls.filter((call) => call.table === table);
}

/** A request with a JSON body. */
function jsonRequest(body: unknown): Request {
  return new Request(`https://app.test/api/projects/${PROJECT_ID}/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The params of the route. */
function params(id = PROJECT_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** The body of a pasted text. */
function paste(): { title: string; content: string } {
  return { title: "Our prices", content: "The starter plan costs 10 euros a month." };
}

/** The embeddings endpoint answers one embedding per text. */
function stubEmbeddings(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input: string[] };

      return new Response(
        JSON.stringify({
          data: body.input.map((_text, index) => ({
            index,
            embedding: Array.from(
              { length: EMBEDDING_DIMENSIONS },
              (_value, at) => (index + at) / 1000,
            ),
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

describe("POST /api/projects/:id/knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
    process.env.OPENAI_API_KEY = "an-openai-key";
    getTokenMock.mockResolvedValue(CLERK_TOKEN);
    authMock.mockResolvedValue({ userId: USER_ID, getToken: getTokenMock });
    stubEmbeddings();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("answers 401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: getTokenMock });
    useClients({ owner: respondToOwner, service: respondToService });

    const response = await POST(jsonRequest(paste()), params());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a project of another owner", async () => {
    // The read goes through the owner client, so RLS limits it to the
    // owner's own projects: the row is not there.
    const { service } = useClients({
      owner: (call) =>
        call.table === "projects" ? { data: null, error: null } : respondToOwner(call),
      service: respondToService,
    });

    const response = await POST(jsonRequest(paste()), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    // Nothing was reserved for a project that is not the owner's.
    expect(service.calls).toHaveLength(0);
  });

  it("answers 404 for an id that is not a project id", async () => {
    useClients({ owner: respondToOwner, service: respondToService });

    const response = await POST(jsonRequest(paste()), params("not-a-uuid"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 400 for a body that does not match", async () => {
    useClients({ owner: respondToOwner, service: respondToService });

    const response = await POST(jsonRequest({ title: "Our prices" }), params());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });

  it("creates the chunks and ends up ready", async () => {
    const { service } = useClients({ owner: respondToOwner, service: respondToService });

    const response = await POST(jsonRequest(paste()), params());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.source.id).toBe(SOURCE_ID);
    expect(body.source.status).toBe("ready");

    const inserts = callsTo(service.calls, "knowledge_chunks");

    expect(inserts).toHaveLength(1);

    const rows = inserts[0]?.payload as { content: string; embedding: string; source_id: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe("The starter plan costs 10 euros a month.");
    expect(rows[0]?.source_id).toBe(SOURCE_ID);
    // The embedding is the width of the column.
    expect(rows[0]?.embedding.split(",")).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("writes the chunks with the service client, not the owner client", async () => {
    const { owner, service } = useClients({ owner: respondToOwner, service: respondToService });

    await POST(jsonRequest(paste()), params());

    expect(callsTo(owner.calls, "knowledge_chunks")).toHaveLength(0);
    expect(callsTo(service.calls, "knowledge_chunks")).toHaveLength(1);
  });

  it("sets the source to processing and then to ready", async () => {
    const { service } = useClients({ owner: respondToOwner, service: respondToService });

    await POST(jsonRequest(paste()), params());

    const statuses = callsTo(service.calls, "knowledge_sources").map(
      (call) => (call.payload as { status: string }).status,
    );

    expect(statuses).toEqual(["processing", "ready"]);
  });

  it("counts the sources of the plan the owner is on", async () => {
    const { service } = useClients({ owner: respondToOwner, service: respondToService });

    await POST(jsonRequest(paste()), params());

    const reserve = service.calls.find((call) => call.op === "rpc");

    expect(reserve?.args).toMatchObject({
      p_max_sources: 3,
      p_type: "text",
      p_project_id: PROJECT_ID,
    });
  });

  it("counts 25 sources on the pro plan", async () => {
    const { service } = useClients({
      owner: (call) =>
        call.table === "accounts"
          ? { data: { ...ACCOUNT_ROW, plan: "pro" }, error: null }
          : respondToOwner(call),
      service: respondToService,
    });

    await POST(jsonRequest(paste()), params());

    const reserve = service.calls.find((call) => call.op === "rpc");

    expect(reserve?.args).toMatchObject({ p_max_sources: 25 });
  });

  it("answers 409 with its own refusal when the plan does not allow another source", async () => {
    const { service } = useClients({
      owner: respondToOwner,
      service: (call) =>
        call.op === "rpc"
          ? {
              data: null,
              error: {
                code: "P0001",
                message: "knowledge source limit reached for plan",
                details: null,
                hint: "plan_limit_knowledge",
              },
            }
          : respondToService(call),
    });

    const response = await POST(jsonRequest(paste()), params());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toBe("This plan does not allow another knowledge source.");
    // Nothing was processed for a source that was not reserved.
    expect(callsTo(service.calls, "knowledge_chunks")).toHaveLength(0);
  });

  it("answers 500 and marks the source failed when the pipeline throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );

    const { service } = useClients({ owner: respondToOwner, service: respondToService });

    const response = await POST(jsonRequest(paste()), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("internal_error");

    const statuses = callsTo(service.calls, "knowledge_sources").map(
      (call) => (call.payload as { status: string }).status,
    );

    expect(statuses).toEqual(["processing", "failed"]);
  });
});

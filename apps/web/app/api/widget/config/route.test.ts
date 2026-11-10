import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "./route";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock:
    vi.fn<(url: string, key: string, options: SupabaseClientOptions<"public">) => unknown>(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
// `server-only` throws outside a React Server Component. Next.js resolves it
// to an empty module there; the test needs the same.
vi.mock("server-only", () => ({}));

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_a_publishable_value";
const SECRET_KEY = "sb_secret_a_secret_value";

const PUBLIC_KEY = `pk_${"a".repeat(32)}`;
const PROJECT_ID = "3f2b1a44-9c1e-4a5b-8d2e-1f0a2b3c4d5e";
const OWNER_ID = "user_123";

const PROJECT_ROW = { id: PROJECT_ID, owner_id: OWNER_ID };

const CONFIG_ROW = {
  button_color: "#ff0000",
  position: "bottom-left",
  label: "Talk to us",
  animation: "slide",
  header_text: "Support",
  show_badge: false,
};

type FakeCall = {
  table: string;
  op: "select" | "update" | "delete" | "upsert" | "rpc";
  columns?: string;
  filters: [string, unknown][];
};

type FakeError = { message: string; code?: string; hint?: string; details?: string | null };

type FakeResult = { data: unknown; error: FakeError | null };

type FakeBuilder = {
  select(columns: string): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  maybeSingle(): Promise<FakeResult>;
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
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(respond(call));
        },
      };

      return builder;
    },
  };

  return { client, calls };
}

/** The query a fake client was given for a table. */
function queryFor(calls: FakeCall[], table: string): FakeCall {
  const call = calls.find((candidate) => candidate.table === table);
  if (!call) {
    throw new Error(`The client was not asked about ${table}`);
  }
  return call;
}

/** A request for the config of a project. */
function configRequest(key?: string): Request {
  const url =
    key === undefined
      ? "https://app.test/api/widget/config"
      : `https://app.test/api/widget/config?key=${key}`;
  return new Request(url);
}

describe("GET /api/widget/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("answers the defaults and the badge for a free project", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "projects") {
        return { data: PROJECT_ROW, error: null };
      }
      return { data: { plan: "free" }, error: null };
    });
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest(PUBLIC_KEY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ config: DEFAULT_WIDGET_CONFIG });
    expect(body.config.showBadge).toBe(true);
  });

  it("answers the stored config for a pro project", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "projects") {
        return { data: PROJECT_ROW, error: null };
      }
      if (call.table === "accounts") {
        return { data: { plan: "pro" }, error: null };
      }
      return { data: CONFIG_ROW, error: null };
    });
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest(PUBLIC_KEY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      config: {
        buttonColor: "#ff0000",
        position: "bottom-left",
        label: "Talk to us",
        animation: "slide",
        headerText: "Support",
        showBadge: false,
      },
    });
  });

  it("reads the plan from the owner's account row on the server", async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === "projects") {
        return { data: PROJECT_ROW, error: null };
      }
      return { data: { plan: "free" }, error: null };
    });
    createClientMock.mockImplementation(() => client);

    await GET(configRequest(PUBLIC_KEY));

    // The project is found by its public key, and the plan by the owner of
    // that project - both from the database, never from the request.
    expect(queryFor(calls, "projects").filters).toEqual([["public_key", PUBLIC_KEY]]);
    expect(queryFor(calls, "accounts").filters).toEqual([["clerk_user_id", OWNER_ID]]);
  });

  it("answers 404 for an unknown key", async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }));
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest(PUBLIC_KEY));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers the same 404 for a key that is not a public key", async () => {
    // The answer must not tell the caller that the key was well formed and
    // only the project is missing.
    const { client } = fakeClient(() => ({ data: null, error: null }));
    createClientMock.mockImplementation(() => client);

    const unknown = await GET(configRequest(PUBLIC_KEY));
    const malformed = await GET(configRequest("not-a-public-key"));

    expect(malformed.status).toBe(404);
    expect(await malformed.json()).toEqual(await unknown.json());
  });

  it("answers 400 when there is no key at all", async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }));
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });

  it("needs no session and reads with the service client", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "projects") {
        return { data: PROJECT_ROW, error: null };
      }
      return { data: { plan: "free" }, error: null };
    });
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest(PUBLIC_KEY));

    // The route never asks Clerk for a session: the public key is all the
    // caller has, and it grants no owner rights.
    expect(response.status).toBe(200);
    const keys = createClientMock.mock.calls.map((call) => call[1]);
    expect(keys).toEqual([SECRET_KEY]);
  });

  it("allows any origin", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "projects") {
        return { data: PROJECT_ROW, error: null };
      }
      return { data: { plan: "free" }, error: null };
    });
    createClientMock.mockImplementation(() => client);

    const response = await GET(configRequest(PUBLIC_KEY));

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers the preflight", () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

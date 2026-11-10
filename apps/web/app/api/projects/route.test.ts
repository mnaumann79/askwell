import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../../lib/projects/fake-supabase";
import { GET, POST } from "./route";

const { authMock, createOwnerClientMock, createServiceClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createOwnerClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: createOwnerClientMock }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: createServiceClientMock }));

const OWNER = "user_2owner";
const PROJECT_ROW = {
  id: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
  name: "Acme",
  public_key: "pk_0123456789abcdef0123456789abcdef",
  messages_used: 3,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-09T21:15:30.123456+00:00",
};

const PROJECT = {
  id: PROJECT_ROW.id,
  name: PROJECT_ROW.name,
  publicKey: PROJECT_ROW.public_key,
  messagesUsed: PROJECT_ROW.messages_used,
  periodStart: PROJECT_ROW.period_start,
  createdAt: PROJECT_ROW.created_at,
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/projects", () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeSupabase({
      select: (call) =>
        call.table === "accounts" ? { data: { plan: "free" } } : { data: [PROJECT_ROW] },
    });
    authMock.mockResolvedValue({ userId: OWNER });
    createOwnerClientMock.mockResolvedValue(fake.client);
  });

  it("answers with the projects of the owner", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ projects: [PROJECT] });
  });

  it("does not filter by owner in the query, RLS does that", async () => {
    await GET();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.table).toBe("projects");
    expect(fake.calls[0]?.filters).toEqual({});
  });

  it("refuses without a session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Sign in to see your projects." },
    });
    expect(createOwnerClientMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeSupabase({
      select: (call) => (call.table === "accounts" ? { data: { plan: "free" } } : { data: [] }),
      rpc: () => ({ data: PROJECT_ROW }),
    });
    authMock.mockResolvedValue({ userId: OWNER });
    createOwnerClientMock.mockResolvedValue(fake.client);
    createServiceClientMock.mockReturnValue(fake.client);
  });

  it("creates a project with a public key and the default widget config", async () => {
    const response = await POST(postRequest({ name: "Acme" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ project: PROJECT });

    const call = fake.calls.find((entry) => entry.operation === "rpc");
    expect(call?.args).toEqual({
      p_owner_id: OWNER,
      p_name: "Acme",
      p_max_projects: PLAN_LIMITS.free.projects,
      p_widget_config: DEFAULT_WIDGET_CONFIG,
    });
  });

  it("takes the limit from the plan of the owner, read on the server", async () => {
    fake = fakeSupabase({
      select: (call) => (call.table === "accounts" ? { data: { plan: "pro" } } : { data: [] }),
      rpc: () => ({ data: PROJECT_ROW }),
    });
    createOwnerClientMock.mockResolvedValue(fake.client);
    createServiceClientMock.mockReturnValue(fake.client);

    await POST(postRequest({ name: "Acme" }));

    const call = fake.calls.find((entry) => entry.operation === "rpc");
    expect(call?.args?.p_max_projects).toBe(PLAN_LIMITS.pro.projects);
  });

  it("refuses a request without a name", async () => {
    const response = await POST(postRequest({ name: "  " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", message: "Give the project a name." },
    });
    expect(fake.calls.filter((call) => call.operation === "rpc")).toHaveLength(0);
  });

  it("refuses without a session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST(postRequest({ name: "Acme" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Sign in to create a project." },
    });
  });

  it("answers 402 when the plan allows no more projects", async () => {
    fake = fakeSupabase({
      select: (call) => (call.table === "accounts" ? { data: { plan: "free" } } : { data: [] }),
      rpc: () => ({
        data: null,
        error: { message: "project limit reached for plan", code: "PT001" },
      }),
    });
    createOwnerClientMock.mockResolvedValue(fake.client);
    createServiceClientMock.mockReturnValue(fake.client);

    const response = await POST(postRequest({ name: "Acme" }));

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("payment_required");
    expect(body.error.message).toContain("1 project");
    expect(body.error.message).toContain("Pro allows 5");
  });

  it("answers 402 when the owner already has as many projects as the plan allows", async () => {
    // The Data API answers the PT001 of the function with a 502 and no error
    // code, so the route counts the projects of the owner itself and refuses
    // before it calls the function.
    fake = fakeSupabase({
      select: (call) =>
        call.table === "accounts" ? { data: { plan: "free" } } : { data: [PROJECT_ROW] },
      rpc: () => ({ data: PROJECT_ROW }),
    });
    createOwnerClientMock.mockResolvedValue(fake.client);
    createServiceClientMock.mockReturnValue(fake.client);

    const response = await POST(postRequest({ name: "Acme" }));

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("payment_required");
    expect(body.error.message).toContain("1 project");
    expect(body.error.message).toContain("Pro allows 5");
    expect(fake.calls.filter((call) => call.operation === "rpc")).toHaveLength(0);
  });

  it("reads the projects of the owner through the owner client, so RLS counts only its own", async () => {
    await POST(postRequest({ name: "Acme" }));

    const call = fake.calls.find(
      (entry) => entry.operation === "select" && entry.table === "projects",
    );
    expect(call).toBeDefined();
    expect(call?.filters).toEqual({});
  });
});

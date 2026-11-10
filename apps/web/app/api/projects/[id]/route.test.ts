import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "../../../../lib/projects/fake-supabase";
import { DELETE, PATCH } from "./route";

const { authMock, createOwnerClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createOwnerClientMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: createOwnerClientMock }));

const OWNER = "user_2owner";
const PROJECT_ID = "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a";
const PROJECT_ROW = {
  id: PROJECT_ID,
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

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function requestWith(method: string, body: unknown): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/projects/:id", () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeSupabase({
      update: () => ({ data: [{ ...PROJECT_ROW, name: "Acme II" }] }),
    });
    authMock.mockResolvedValue({ userId: OWNER });
    createOwnerClientMock.mockResolvedValue(fake.client);
  });

  it("renames the project and changes nothing else", async () => {
    const response = await PATCH(requestWith("PATCH", { name: "Acme II" }), context(PROJECT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project: { ...PROJECT, name: "Acme II" },
    });

    const call = fake.calls[0];
    expect(call?.operation).toBe("update");
    expect(call?.values).toEqual({ name: "Acme II" });
    expect(call?.filters).toEqual({ id: PROJECT_ID });
  });

  it("answers 404 for a project that is not the owner's", async () => {
    fake = fakeSupabase({ update: () => ({ data: [] }) });
    createOwnerClientMock.mockResolvedValue(fake.client);

    const response = await PATCH(requestWith("PATCH", { name: "Acme II" }), context(PROJECT_ID));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "No such project." },
    });
  });

  it("refuses a request without a name", async () => {
    const response = await PATCH(requestWith("PATCH", {}), context(PROJECT_ID));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", message: "Give the project a name." },
    });
  });

  it("refuses without a session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await PATCH(requestWith("PATCH", { name: "Acme II" }), context(PROJECT_ID));

    expect(response.status).toBe(401);
  });

  it("answers 404 for an id that cannot be a project", async () => {
    const response = await PATCH(requestWith("PATCH", { name: "Acme II" }), context("not-an-id"));

    expect(response.status).toBe(404);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("DELETE /api/projects/:id", () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeSupabase({ delete: () => ({ data: [{ id: PROJECT_ID }] }) });
    authMock.mockResolvedValue({ userId: OWNER });
    createOwnerClientMock.mockResolvedValue(fake.client);
  });

  it("deletes the project", async () => {
    const response = await DELETE(requestWith("DELETE", {}), context(PROJECT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: PROJECT_ID });

    const call = fake.calls[0];
    expect(call?.operation).toBe("delete");
    expect(call?.filters).toEqual({ id: PROJECT_ID });
  });

  it("answers 404 for a project that is not the owner's", async () => {
    fake = fakeSupabase({ delete: () => ({ data: [] }) });
    createOwnerClientMock.mockResolvedValue(fake.client);

    const response = await DELETE(requestWith("DELETE", {}), context(PROJECT_ID));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "No such project." },
    });
  });

  it("refuses without a session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await DELETE(requestWith("DELETE", {}), context(PROJECT_ID));

    expect(response.status).toBe(401);
  });
});

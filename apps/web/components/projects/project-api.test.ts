import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, listProjects, renameProject } from "./project-api";

const PROJECT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  publicKey: `pk_${"a".repeat(32)}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The answer a route gives. */
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the projects routes", () => {
  it("reads the owner's projects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ projects: [PROJECT] })),
    );

    const result = await listProjects();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("expected the list to succeed");
    }

    expect(result.data.projects).toHaveLength(1);
    expect(result.data.projects[0]?.name).toBe("Alpha");
  });

  it("asks the projects route", async () => {
    const fetchMock = vi.fn(async (_url: string) => answer({ projects: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listProjects();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects");
  });

  it("creates a project with a name and nothing else", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      answer({ project: PROJECT }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProject("Alpha");

    expect(result.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Alpha" });
  });

  it("renames a project on its own route", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      answer({ project: { ...PROJECT, name: "Beta" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await renameProject(PROJECT.id, "Beta");

    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/api/projects/${PROJECT.id}`);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Beta" });
  });

  it("deletes a project on its own route", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      answer({ id: PROJECT.id }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteProject(PROJECT.id);

    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/api/projects/${PROJECT.id}`);
    expect(init?.method).toBe("DELETE");
  });

  it("refuses a name that is not one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ projects: [] })),
    );

    const result = await createProject("");

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("expected a refusal");
    }

    expect(result.code).toBe("invalid_request");
  });

  it("reads the plan limit out of the refusal, in the shared error shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        answer({ error: { code: "conflict", message: "The free plan allows one project." } }, 409),
      ),
    );

    const result = await createProject("Alpha");

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("expected a refusal");
    }

    expect(result.code).toBe("conflict");
    expect(result.message).toBe("The free plan allows one project.");
  });

  it("refuses an answer that is not the shape the contract names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ projects: [{ name: "Alpha" }] })),
    );

    const result = await listProjects();

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("expected a refusal");
    }

    expect(result.message).toMatch(/shape we do not understand/);
  });
});

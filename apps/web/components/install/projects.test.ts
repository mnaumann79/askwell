import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProjects } from "./projects";

const PROJECT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  publicKey: `pk_${"a".repeat(32)}`,
  messagesUsed: 3,
  periodStart: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers the route would give. */
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchProjects", () => {
  it("reads the projects the route answers", async () => {
    const fetchMock = vi.fn(async () => answer({ projects: [PROJECT] }));
    vi.stubGlobal("fetch", fetchMock);

    const projects = await fetchProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("Alpha");
    expect(projects[0]?.publicKey).toBe(PROJECT.publicKey);
  });

  it("asks the projects route", async () => {
    const fetchMock = vi.fn(async (_url: string) => answer({ projects: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchProjects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects");
  });

  it("reads the message of an error answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        answer({ error: { code: "unauthorized", message: "Sign in first." } }, 401),
      ),
    );

    await expect(fetchProjects()).rejects.toThrow("Sign in first.");
  });

  it("refuses an answer that is not the shape the contract names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ projects: [{ name: "Alpha" }] })),
    );

    await expect(fetchProjects()).rejects.toThrow(/shape we do not understand/);
  });
});

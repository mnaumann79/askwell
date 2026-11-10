import { describe, expect, it } from "vitest";
import {
  createProjectRequestSchema,
  deleteProjectResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  projectSchema,
  updateProjectRequestSchema,
} from "./projects";

const PROJECT = {
  id: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
  name: "Acme",
  publicKey: "pk_0123456789abcdef0123456789abcdef",
  messagesUsed: 12,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt: "2026-11-09T21:15:30.123456+00:00",
};

describe("a project", () => {
  it("takes the fields of a project", () => {
    expect(projectSchema.safeParse(PROJECT).success).toBe(true);
  });

  it("refuses a project with a wrong type", () => {
    expect(projectSchema.safeParse({ ...PROJECT, messagesUsed: "12" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...PROJECT, messagesUsed: -1 }).success).toBe(false);
    expect(projectSchema.safeParse({ ...PROJECT, id: "not-a-uuid" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...PROJECT, publicKey: "nope" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...PROJECT, createdAt: "yesterday" }).success).toBe(false);
  });
});

describe("GET /api/projects", () => {
  it("answers with a list of projects", () => {
    expect(projectListResponseSchema.safeParse({ projects: [PROJECT] }).success).toBe(true);
  });

  it("refuses an answer that is not a list", () => {
    expect(
      projectListResponseSchema.safeParse({ projects: [PROJECT, { ...PROJECT, id: 1 }] }).success,
    ).toBe(false);
    expect(projectListResponseSchema.safeParse({ projects: {} }).success).toBe(false);
  });
});

describe("POST /api/projects", () => {
  it("takes a name", () => {
    expect(createProjectRequestSchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("refuses a name that is empty or too long", () => {
    expect(createProjectRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProjectRequestSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createProjectRequestSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    expect(createProjectRequestSchema.safeParse({}).success).toBe(false);
    expect(createProjectRequestSchema.safeParse({ name: 42 }).success).toBe(false);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("takes a name", () => {
    expect(updateProjectRequestSchema.safeParse({ name: "Acme II" }).success).toBe(true);
  });

  it("takes only the name and ignores anything else", () => {
    expect(updateProjectRequestSchema.parse({ name: "Acme", publicKey: "pk_x" })).toEqual({
      name: "Acme",
    });
    expect(updateProjectRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ name: 42 }).success).toBe(false);
  });
});

describe("the project responses", () => {
  it("answers with one project", () => {
    expect(projectResponseSchema.safeParse({ project: PROJECT }).success).toBe(true);
    expect(projectResponseSchema.safeParse({}).success).toBe(false);
  });

  it("answers with the id of a deleted project", () => {
    expect(deleteProjectResponseSchema.safeParse({ id: PROJECT.id }).success).toBe(true);
    expect(deleteProjectResponseSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

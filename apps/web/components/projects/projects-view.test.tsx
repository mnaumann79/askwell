import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "@askwell/shared";
import { limitLabel, ProjectsView } from "./projects-view";

const ALPHA: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  publicKey: `pk_${"a".repeat(32)}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const BETA: Project = {
  ...ALPHA,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Beta",
};

function view(projects: Project[], limit: number): string {
  return renderToStaticMarkup(
    <ProjectsView
      projects={projects}
      limit={limit}
      onCreated={() => {}}
      onRenamed={() => {}}
      onDeleted={() => {}}
    />,
  );
}

describe("the limit", () => {
  it("says what the owner has and what the plan allows", () => {
    expect(limitLabel(1, 1)).toBe("1 of 1 project");
    expect(limitLabel(3, 5)).toBe("3 of 5 projects");
    expect(limitLabel(0, 1)).toBe("0 of 1 project");
  });
});

describe("ProjectsView", () => {
  it("shows the limit in view", () => {
    expect(view([ALPHA], 1)).toContain("1 of 1 project");
  });

  it("lists the owner's projects", () => {
    const html = view([ALPHA, BETA], 5);

    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });

  it("does not repeat the public key, which belongs to the install page", () => {
    expect(view([ALPHA], 1)).not.toContain(ALPHA.publicKey);
  });

  it("shows an empty state when there is no project", () => {
    const html = view([], 1);

    expect(html).toContain("No projects yet");
    expect(html).toContain("0 of 1 project");
  });

  it("shows the form that creates a project", () => {
    const html = view([ALPHA], 1);

    expect(html).toContain("New project");
    expect(html).toContain("Create");
  });
});

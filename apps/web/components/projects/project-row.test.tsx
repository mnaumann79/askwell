import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "@askwell/shared";
import { DeleteConfirmation, ProjectRow } from "./project-row";

const ALPHA: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  publicKey: `pk_${"a".repeat(32)}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

describe("ProjectRow", () => {
  it("names the project and offers a rename and a delete", () => {
    const html = renderToStaticMarkup(
      <ProjectRow project={ALPHA} onRenamed={() => {}} onDeleted={() => {}} />,
    );

    expect(html).toContain("Alpha");
    expect(html).toContain("Rename");
    expect(html).toContain("Delete");
  });

  it("does not show the confirmation before the delete is asked for", () => {
    const html = renderToStaticMarkup(
      <ProjectRow project={ALPHA} onRenamed={() => {}} onDeleted={() => {}} />,
    );

    expect(html).not.toContain("Delete it");
  });
});

describe("DeleteConfirmation", () => {
  it("asks before the project and everything under it goes", () => {
    const html = renderToStaticMarkup(
      <DeleteConfirmation project={ALPHA} busy={false} onConfirm={() => {}} onCancel={() => {}} />,
    );

    expect(html).toContain("Delete");
    expect(html).toContain("Alpha");
    expect(html).toContain("conversations");
    expect(html).toContain("Delete it");
    expect(html).toContain("Keep it");
  });
});

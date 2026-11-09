import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES, MAX_KNOWLEDGE_TEXT_CHARACTERS } from "./limits";
import {
  deleteKnowledgeResponseSchema,
  finalizeKnowledgeRequestSchema,
  knowledgeSourceResponseSchema,
  knowledgeSourceSchema,
  pasteKnowledgeRequestSchema,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
} from "./knowledge";

const SOURCE = {
  id: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
  projectId: "3c1f2e1d-4c2b-5e9f-8d3b-2a3f4e5d6c7b",
  title: "Handbook",
  type: "pdf",
  status: "uploading",
  createdAt: "2026-11-09T21:15:30.123456+00:00",
};

describe("a knowledge source", () => {
  it("takes the fields of a source", () => {
    expect(knowledgeSourceSchema.safeParse(SOURCE).success).toBe(true);
  });

  it("refuses a source with a wrong type or status", () => {
    expect(knowledgeSourceSchema.safeParse({ ...SOURCE, type: "docx" }).success).toBe(false);
    expect(
      knowledgeSourceSchema.safeParse({ ...SOURCE, status: "uploading_forever" }).success,
    ).toBe(false);
    expect(knowledgeSourceSchema.safeParse({ ...SOURCE, id: "not-a-uuid" }).success).toBe(false);
  });

  it("answers with one source", () => {
    expect(knowledgeSourceResponseSchema.safeParse({ source: SOURCE }).success).toBe(true);
    expect(
      knowledgeSourceResponseSchema.safeParse({ source: { ...SOURCE, title: 1 } }).success,
    ).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge", () => {
  it("takes a title and the pasted text", () => {
    expect(
      pasteKnowledgeRequestSchema.safeParse({ title: "Handbook", content: "Hello" }).success,
    ).toBe(true);
  });

  it("refuses empty text, a missing title or text that is too long", () => {
    expect(pasteKnowledgeRequestSchema.safeParse({ title: "Handbook", content: "" }).success).toBe(
      false,
    );
    expect(pasteKnowledgeRequestSchema.safeParse({ content: "Hello" }).success).toBe(false);
    expect(
      pasteKnowledgeRequestSchema.safeParse({
        title: "Handbook",
        content: "a".repeat(MAX_KNOWLEDGE_TEXT_CHARACTERS + 1),
      }).success,
    ).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  const request = {
    title: "Handbook",
    type: "pdf",
    fileName: "handbook.pdf",
    size: 1024,
  };

  it("takes the file, its type and its declared size", () => {
    expect(uploadUrlRequestSchema.safeParse(request).success).toBe(true);
  });

  it("refuses a pasted text, a missing field or a file that is too big", () => {
    expect(uploadUrlRequestSchema.safeParse({ ...request, type: "text" }).success).toBe(false);
    expect(
      uploadUrlRequestSchema.safeParse({ title: "Handbook", type: "pdf", size: 1024 }).success,
    ).toBe(false);
    expect(uploadUrlRequestSchema.safeParse({ ...request, size: 0 }).success).toBe(false);
    expect(uploadUrlRequestSchema.safeParse({ ...request, size: 1.5 }).success).toBe(false);
    expect(
      uploadUrlRequestSchema.safeParse({ ...request, size: MAX_KNOWLEDGE_FILE_BYTES + 1 }).success,
    ).toBe(false);
    expect(
      uploadUrlRequestSchema.safeParse({ ...request, size: MAX_KNOWLEDGE_FILE_BYTES }).success,
    ).toBe(true);
  });

  it("answers with the source and a signed url", () => {
    const body = {
      source: SOURCE,
      uploadUrl:
        "https://project-ref.storage.supabase.co/object/sign/knowledge/handbook.pdf?token=abc",
    };

    expect(uploadUrlResponseSchema.safeParse(body).success).toBe(true);
    expect(uploadUrlResponseSchema.safeParse({ ...body, uploadUrl: "not a url" }).success).toBe(
      false,
    );
    expect(uploadUrlResponseSchema.safeParse({ source: SOURCE }).success).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("takes the source and its real size", () => {
    expect(
      finalizeKnowledgeRequestSchema.safeParse({ sourceId: SOURCE.id, size: 1024 }).success,
    ).toBe(true);
  });

  it("refuses a bad source id or a size that is too big", () => {
    expect(finalizeKnowledgeRequestSchema.safeParse({ sourceId: "nope", size: 1024 }).success).toBe(
      false,
    );
    expect(finalizeKnowledgeRequestSchema.safeParse({ sourceId: SOURCE.id }).success).toBe(false);
    expect(
      finalizeKnowledgeRequestSchema.safeParse({
        sourceId: SOURCE.id,
        size: MAX_KNOWLEDGE_FILE_BYTES + 1,
      }).success,
    ).toBe(false);
  });
});

describe("DELETE /api/knowledge/:id", () => {
  it("answers with the id of the deleted source", () => {
    expect(deleteKnowledgeResponseSchema.safeParse({ id: SOURCE.id }).success).toBe(true);
    expect(deleteKnowledgeResponseSchema.safeParse({}).success).toBe(false);
  });
});

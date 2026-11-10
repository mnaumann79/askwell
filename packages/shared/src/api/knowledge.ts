import { z } from "zod";
import { MAX_KNOWLEDGE_FILE_BYTES, MAX_KNOWLEDGE_TEXT_CHARACTERS } from "./limits";

/**
 * The knowledge routes of the owner (docs/project.md §6.4, §8).
 */

export const knowledgeSourceTypeSchema = z.enum(["text", "pdf", "md", "txt"]);
export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>;

export const knowledgeSourceStatusSchema = z.enum(["uploading", "processing", "ready", "failed"]);
export type KnowledgeSourceStatus = z.infer<typeof knowledgeSourceStatusSchema>;

/** A source as the API answers it. */
export const knowledgeSourceSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  type: knowledgeSourceTypeSchema,
  /** "uploading" is shown as processing (§6.4). */
  status: knowledgeSourceStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const knowledgeSourceResponseSchema = z.object({
  source: knowledgeSourceSchema,
});
export type KnowledgeSourceResponse = z.infer<typeof knowledgeSourceResponseSchema>;

/** `POST /api/projects/:id/knowledge` — paste text. */
export const pasteKnowledgeRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(MAX_KNOWLEDGE_TEXT_CHARACTERS),
});
export type PasteKnowledgeRequest = z.infer<typeof pasteKnowledgeRequestSchema>;

/** `POST /api/projects/:id/knowledge/upload-url` — reserve a file. */
export const uploadUrlRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** A pasted text is not a file, so it is not one of these. */
  type: z.enum(["pdf", "md", "txt"]),
  fileName: z.string().trim().min(1).max(255),
  /** The declared size. The real one is checked again at finalize (§6.4). */
  size: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

/** The signed URL the browser uploads the file to. It is used once. */
export const uploadUrlResponseSchema = z.object({
  source: knowledgeSourceSchema,
  uploadUrl: z.url(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

/** `POST /api/projects/:id/knowledge/finalize` — claim the reserved source. */
export const finalizeKnowledgeRequestSchema = z.object({
  sourceId: z.uuid(),
  /** The real size of the uploaded file. */
  size: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES),
});
export type FinalizeKnowledgeRequest = z.infer<typeof finalizeKnowledgeRequestSchema>;

/** `DELETE /api/knowledge/:id` */
export const deleteKnowledgeResponseSchema = z.object({
  id: z.uuid(),
});
export type DeleteKnowledgeResponse = z.infer<typeof deleteKnowledgeResponseSchema>;

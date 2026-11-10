import { z } from "zod";
import { PUBLIC_KEY_PATTERN } from "./limits";

/**
 * The project routes of the owner (docs/project.md §8).
 */

/** A project as the API answers it. */
export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
  /** Accepted chat messages this month. */
  messagesUsed: z.number().int().nonnegative(),
  /** When the monthly count started. */
  periodStart: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Project = z.infer<typeof projectSchema>;

/** `GET /api/projects` */
export const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

/** `POST /api/projects` */
export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const projectResponseSchema = z.object({
  project: projectSchema,
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

/** `PATCH /api/projects/:id` — a project can only be renamed (§6.3). */
export const updateProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

/** `DELETE /api/projects/:id` */
export const deleteProjectResponseSchema = z.object({
  id: z.uuid(),
});
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;

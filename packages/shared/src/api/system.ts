import { z } from "zod";

/**
 * The system route (docs/project.md §8).
 *
 * The Clerk webhook has the shape of Clerk, not of ours.
 */

/** `GET /api/posthog-config` — the public project key and host. */
export const posthogConfigResponseSchema = z.object({
  key: z.string(),
  host: z.url(),
});
export type PostHogConfigResponse = z.infer<typeof posthogConfigResponseSchema>;

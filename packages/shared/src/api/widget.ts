import { z } from "zod";
import { HEX_COLOR_PATTERN, widgetConfigSchema } from "../widget-config";
import { MAX_MESSAGE_CHARACTERS, PUBLIC_KEY_PATTERN } from "./limits";

/**
 * The routes of the widget (docs/project.md §8).
 *
 * They are public: the widget loader and the panel of the customer's website
 * call them from any origin.
 */

/** A public key identifies a project and grants nothing (§9). */
export const publicKeySchema = z.string().regex(PUBLIC_KEY_PATTERN);

/** `GET /api/widget/config` — the config of the project, plan applied. */
export const widgetConfigQuerySchema = z.object({
  key: publicKeySchema,
});
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;

export const widgetConfigResponseSchema = z.object({
  config: widgetConfigSchema,
});
export type WidgetConfigResponse = z.infer<typeof widgetConfigResponseSchema>;

/** `POST /api/widget/chat` — a visitor asks something. */
export const widgetChatRequestSchema = z.object({
  key: publicKeySchema,
  visitorId: z.string().trim().min(1).max(100),
  conversationId: z.uuid().optional(),
  /** At most 1,000 characters (§6.6). */
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARACTERS),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;

export const widgetChatResponseSchema = z.object({
  conversationId: z.uuid(),
  reply: z.string().min(1),
});
export type WidgetChatResponse = z.infer<typeof widgetChatResponseSchema>;

/** `PATCH /api/projects/:id/config` — the owner customizes the widget. */
export const widgetConfigUpdateRequestSchema = z.object({
  buttonColor: z.string().regex(HEX_COLOR_PATTERN),
  position: widgetConfigSchema.shape.position,
  label: z.string().trim().min(1).max(50),
  animation: widgetConfigSchema.shape.animation,
  headerText: z.string().trim().min(1).max(100),
  showBadge: z.boolean(),
});
export type WidgetConfigUpdateRequest = z.infer<typeof widgetConfigUpdateRequestSchema>;

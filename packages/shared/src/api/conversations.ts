import { z } from "zod";

/**
 * The conversation routes of the owner (docs/project.md §6.7, §8).
 */

export const messageRoleSchema = z.enum(["visitor", "bot"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/** A message as the API answers it. */
export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: messageRoleSchema,
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Message = z.infer<typeof messageSchema>;

/** A conversation in the list: the first message, how many messages, when. */
export const conversationSummarySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  visitorId: z.string(),
  /** The first message of the conversation. */
  preview: z.string(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** `GET /api/projects/:id/conversations` — newest first. */
export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

/** `GET /api/conversations/:id` — the whole thread. */
export const conversationThreadResponseSchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(messageSchema),
});
export type ConversationThreadResponse = z.infer<typeof conversationThreadResponseSchema>;

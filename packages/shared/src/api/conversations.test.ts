import { describe, expect, it } from "vitest";
import {
  conversationListResponseSchema,
  conversationSummarySchema,
  conversationThreadResponseSchema,
  messageSchema,
} from "./conversations";

const CONVERSATION = {
  id: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
  projectId: "3c1f2e1d-4c2b-5e9f-8d3b-2a3f4e5d6c7b",
  visitorId: "visitor-1",
  preview: "How do I reset my password?",
  messageCount: 4,
  createdAt: "2026-11-09T21:15:30.123456+00:00",
};

const MESSAGE = {
  id: "4d2f3e2c-5d3c-6f0a-9e4c-3b4a5f6e7d8c",
  conversationId: CONVERSATION.id,
  role: "visitor",
  body: "How do I reset my password?",
  createdAt: "2026-11-09T21:15:30.123456+00:00",
};

describe("a message", () => {
  it("takes the fields of a message", () => {
    expect(messageSchema.safeParse(MESSAGE).success).toBe(true);
  });

  it("refuses a role that is not visitor or bot", () => {
    expect(messageSchema.safeParse({ ...MESSAGE, role: "admin" }).success).toBe(false);
    expect(messageSchema.safeParse({ ...MESSAGE, body: 42 }).success).toBe(false);
    expect(messageSchema.safeParse({ ...MESSAGE, conversationId: "nope" }).success).toBe(false);
  });
});

describe("a conversation in the list", () => {
  it("takes the first message, the count and the time", () => {
    expect(conversationSummarySchema.safeParse(CONVERSATION).success).toBe(true);
  });

  it("refuses a count that is not a number", () => {
    expect(
      conversationSummarySchema.safeParse({ ...CONVERSATION, messageCount: "4" }).success,
    ).toBe(false);
    expect(conversationSummarySchema.safeParse({ ...CONVERSATION, messageCount: -1 }).success).toBe(
      false,
    );
  });
});

describe("GET /api/projects/:id/conversations", () => {
  it("answers with a list of conversations", () => {
    expect(
      conversationListResponseSchema.safeParse({ conversations: [CONVERSATION] }).success,
    ).toBe(true);
  });

  it("refuses an answer that is not a list", () => {
    expect(
      conversationListResponseSchema.safeParse({ conversations: [{ ...CONVERSATION, id: 1 }] })
        .success,
    ).toBe(false);
    expect(conversationListResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("GET /api/conversations/:id", () => {
  it("answers with the conversation and its messages", () => {
    const body = { conversation: CONVERSATION, messages: [MESSAGE] };

    expect(conversationThreadResponseSchema.safeParse(body).success).toBe(true);
  });

  it("refuses an answer with a message that is wrong", () => {
    const body = { conversation: CONVERSATION, messages: [{ ...MESSAGE, role: "system" }] };

    expect(conversationThreadResponseSchema.safeParse(body).success).toBe(false);
    expect(conversationThreadResponseSchema.safeParse({ conversation: CONVERSATION }).success).toBe(
      false,
    );
  });
});

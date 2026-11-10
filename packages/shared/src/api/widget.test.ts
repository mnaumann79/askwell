import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "../widget-config";
import { MAX_MESSAGE_CHARACTERS } from "./limits";
import {
  publicKeySchema,
  widgetChatRequestSchema,
  widgetChatResponseSchema,
  widgetConfigQuerySchema,
  widgetConfigResponseSchema,
  widgetConfigUpdateRequestSchema,
} from "./widget";

const KEY = "pk_0123456789abcdef0123456789abcdef";

describe("the public key", () => {
  it("takes a pk_ key", () => {
    expect(publicKeySchema.safeParse(KEY).success).toBe(true);
  });

  it("refuses a key that is not one", () => {
    expect(publicKeySchema.safeParse("pk_tooshort").success).toBe(false);
    expect(publicKeySchema.safeParse("0123456789abcdef0123456789abcdef").success).toBe(false);
    expect(publicKeySchema.safeParse("pk_0123456789ABCDEF0123456789abcdef").success).toBe(false);
    expect(publicKeySchema.safeParse("").success).toBe(false);
  });
});

describe("GET /api/widget/config", () => {
  it("takes a key", () => {
    expect(widgetConfigQuerySchema.safeParse({ key: KEY }).success).toBe(true);
  });

  it("refuses a query without a key", () => {
    expect(widgetConfigQuerySchema.safeParse({}).success).toBe(false);
    expect(widgetConfigQuerySchema.safeParse({ key: "nope" }).success).toBe(false);
  });

  it("answers with the config", () => {
    const body = { config: DEFAULT_WIDGET_CONFIG };

    expect(widgetConfigResponseSchema.safeParse(body).success).toBe(true);
  });

  it("refuses an answer that is not a config", () => {
    expect(
      widgetConfigResponseSchema.safeParse({
        config: { ...DEFAULT_WIDGET_CONFIG, showBadge: "yes" },
      }).success,
    ).toBe(false);
    expect(
      widgetConfigResponseSchema.safeParse({
        config: { ...DEFAULT_WIDGET_CONFIG, position: "middle" },
      }).success,
    ).toBe(false);
    expect(widgetConfigResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("POST /api/widget/chat", () => {
  const request = {
    key: KEY,
    visitorId: "visitor-1",
    message: "How do I reset my password?",
  };

  it("takes a key, a visitor and a message", () => {
    expect(widgetChatRequestSchema.safeParse(request).success).toBe(true);
  });

  it("takes a conversation id as well", () => {
    const withConversation = {
      ...request,
      conversationId: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
    };

    expect(widgetChatRequestSchema.safeParse(withConversation).success).toBe(true);
  });

  it("refuses a request without a visitor or a message", () => {
    expect(widgetChatRequestSchema.safeParse({ key: KEY, message: "hi" }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ key: KEY, visitorId: "visitor-1" }).success).toBe(
      false,
    );
    expect(widgetChatRequestSchema.safeParse({ ...request, visitorId: "" }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ ...request, message: "" }).success).toBe(false);
  });

  it("refuses a message of more than 1,000 characters", () => {
    const long = { ...request, message: "a".repeat(MAX_MESSAGE_CHARACTERS + 1) };

    expect(widgetChatRequestSchema.safeParse(long).success).toBe(false);
    expect(
      widgetChatRequestSchema.safeParse({ ...request, message: "a".repeat(MAX_MESSAGE_CHARACTERS) })
        .success,
    ).toBe(true);
  });

  it("refuses a bad conversation id", () => {
    expect(
      widgetChatRequestSchema.safeParse({ ...request, conversationId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("answers with a conversation id and a reply", () => {
    const body = {
      conversationId: "2b0e1d0e-3b1a-4d8e-9c2a-1f2e3d4c5b6a",
      reply: "You can reset it from the settings page.",
    };

    expect(widgetChatResponseSchema.safeParse(body).success).toBe(true);
    expect(widgetChatResponseSchema.safeParse({ ...body, reply: "" }).success).toBe(false);
    expect(widgetChatResponseSchema.safeParse({ ...body, conversationId: "nope" }).success).toBe(
      false,
    );
  });
});

describe("PATCH /api/projects/:id/config", () => {
  const config = {
    buttonColor: "#222222",
    position: "bottom-left",
    label: "Support",
    animation: "slide",
    headerText: "Askwell Support",
    showBadge: false,
  };

  it("takes the whole config", () => {
    expect(widgetConfigUpdateRequestSchema.safeParse(config).success).toBe(true);
  });

  it("refuses a config with a wrong type or a missing field", () => {
    expect(widgetConfigUpdateRequestSchema.safeParse({ ...config, showBadge: "no" }).success).toBe(
      false,
    );
    expect(
      widgetConfigUpdateRequestSchema.safeParse({ ...config, animation: "explode" }).success,
    ).toBe(false);
    expect(
      widgetConfigUpdateRequestSchema.safeParse({ ...config, position: "middle" }).success,
    ).toBe(false);
    const { label: _label, ...withoutLabel } = config;
    expect(widgetConfigUpdateRequestSchema.safeParse(withoutLabel).success).toBe(false);
  });

  it("refuses a color that is not a hex color", () => {
    expect(
      widgetConfigUpdateRequestSchema.safeParse({ ...config, buttonColor: "blue" }).success,
    ).toBe(false);
    expect(
      widgetConfigUpdateRequestSchema.safeParse({ ...config, buttonColor: "#12345" }).success,
    ).toBe(false);
    expect(
      widgetConfigUpdateRequestSchema.safeParse({ ...config, buttonColor: "#abc" }).success,
    ).toBe(true);
  });
});

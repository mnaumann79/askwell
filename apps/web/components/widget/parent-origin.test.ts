import { describe, expect, it } from "vitest";
import { parentOrigin, readParentMessage } from "./parent-origin";

const PARENT = "https://customer.example.com";

describe("the origin of the page that embeds the panel", () => {
  it("is the origin of that page", () => {
    expect(parentOrigin(`${PARENT}/pricing?plan=pro`)).toBe(PARENT);
  });

  it("is nothing when there is no referrer", () => {
    expect(parentOrigin("")).toBeNull();
  });

  it("is nothing when the referrer is not a URL", () => {
    expect(parentOrigin("not a url")).toBeNull();
  });
});

describe("the messages from the page that embeds the panel", () => {
  it("ignores a message from another origin", () => {
    const message = readParentMessage(
      { origin: "https://evil.example", data: { type: "askwell:open" } },
      PARENT,
    );

    expect(message).toBeNull();
  });

  it("takes the messages from that page", () => {
    const message = readParentMessage({ origin: PARENT, data: { type: "askwell:open" } }, PARENT);

    expect(message).toEqual({ type: "askwell:open" });
  });

  it("ignores something that is not one of our messages", () => {
    expect(
      readParentMessage({ origin: PARENT, data: { type: "askwell:something-else" } }, PARENT),
    ).toBeNull();
    expect(readParentMessage({ origin: PARENT, data: "hello" }, PARENT)).toBeNull();
    expect(readParentMessage({ origin: PARENT, data: null }, PARENT)).toBeNull();
  });
});

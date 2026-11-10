import { describe, expect, it } from "vitest";
import { getVisitorId, VISITOR_ID_KEY } from "./visitor-id";

/** A storage that behaves like the browser's, in memory. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  } as Storage;
}

describe("the visitor id", () => {
  it("is created once", () => {
    const storage = fakeStorage();

    const id = getVisitorId(storage);

    expect(id).not.toBe("");
    expect(storage.getItem(VISITOR_ID_KEY)).toBe(id);
  });

  it("is reused on the next visit", () => {
    const storage = fakeStorage();
    const first = getVisitorId(storage);

    expect(getVisitorId(storage)).toBe(first);
  });

  it("is another one for another visitor", () => {
    expect(getVisitorId(fakeStorage())).not.toBe(getVisitorId(fakeStorage()));
  });
});

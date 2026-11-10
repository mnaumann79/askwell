import { describe, expect, it } from "vitest";
import { getVisitorId, VISITOR_ID_PREFIX, visitorIdKey } from "./visitor-id";

const KEY = "pk_0123456789abcdef0123456789abcdef";
const OTHER_KEY = "pk_fedcba9876543210fedcba9876543210";

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

    const id = getVisitorId(storage, KEY);

    expect(id).not.toBe("");
    expect(storage.getItem(visitorIdKey(KEY))).toBe(id);
  });

  it("is reused on the next visit", () => {
    const storage = fakeStorage();
    const first = getVisitorId(storage, KEY);

    expect(getVisitorId(storage, KEY)).toBe(first);
  });

  it("is another one for another visitor", () => {
    expect(getVisitorId(fakeStorage(), KEY)).not.toBe(getVisitorId(fakeStorage(), KEY));
  });

  it("is another one for another project", () => {
    const storage = fakeStorage();

    expect(getVisitorId(storage, KEY)).not.toBe(getVisitorId(storage, OTHER_KEY));
  });

  it("is stored under the project, so two owners cannot correlate a visitor", () => {
    const storage = fakeStorage();

    const id = getVisitorId(storage, KEY);

    expect(visitorIdKey(KEY)).toBe(`${VISITOR_ID_PREFIX}${KEY}`);
    expect(storage.getItem(`${VISITOR_ID_PREFIX}${KEY}`)).toBe(id);
  });
});

/**
 * The visitor ID (docs/project.md §6.5).
 *
 * A random ID that belongs to the visitor, not to the owner, and is not a
 * secret. It lives in the iframe's `localStorage`, so it survives the visits
 * of the same visitor and nobody else gets it.
 */

/** The key the ID is stored under, in the iframe's own storage. */
export const VISITOR_ID_KEY = "askwell.visitorId";

/**
 * The visitor ID: the one that is already stored, or a new one.
 *
 * The same storage and the same visitor always get the same ID back.
 */
export function getVisitorId(storage: Storage): string {
  const stored = storage.getItem(VISITOR_ID_KEY);
  if (stored) {
    return stored;
  }

  const id = newVisitorId();
  storage.setItem(VISITOR_ID_KEY, id);
  return id;
}

/** A new random ID. */
export function newVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Older browsers: random enough for an id that grants nothing.
  return `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

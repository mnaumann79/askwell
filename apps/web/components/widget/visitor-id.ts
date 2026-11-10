/**
 * The visitor ID (docs/project.md §6.5).
 *
 * A random ID that belongs to the visitor, not to the owner, and it is not a
 * secret. It lives in the iframe's `localStorage`, so it survives the visits
 * of the same visitor and nobody else gets it.
 *
 * **One ID per project, per browser.** The iframe runs on our own origin, so
 * its `localStorage` is shared by every widget a visitor meets. The owner of a
 * project sees the ID — it is in the conversation summary — so one ID for the
 * whole browser would be a tracking identifier that two unrelated owners
 * could correlate, and one owner with two projects could tell that the same
 * visitor used both. The project is part of the key, so the ID means exactly
 * what it is used for: this visitor, in this project. Nothing needs it to be
 * stable across projects: a conversation belongs to a project, and the ID is
 * only ever read with it.
 */

/** The prefix every visitor ID is stored under, in the iframe's own storage. */
export const VISITOR_ID_PREFIX = "askwell.visitorId.";

/** The key the visitor ID of a project is stored under. */
export function visitorIdKey(publicKey: string): string {
  return `${VISITOR_ID_PREFIX}${publicKey}`;
}

/**
 * The visitor ID of a project: the one that is already stored, or a new one.
 *
 * The same storage, the same project and the same visitor always get the same
 * ID back.
 */
export function getVisitorId(storage: Storage, publicKey: string): string {
  const key = visitorIdKey(publicKey);
  const stored = storage.getItem(key);
  if (stored) {
    return stored;
  }

  const id = newVisitorId();
  storage.setItem(key, id);
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

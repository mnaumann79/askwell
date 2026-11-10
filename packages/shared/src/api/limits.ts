/**
 * The limits of the contract (docs/project.md §6.4, §6.6).
 *
 * They are the numbers the routes check before they write anything.
 */

/** A chat message is at most 1,000 characters (§6.6). */
export const MAX_MESSAGE_CHARACTERS = 1000;

/** A knowledge file is at most 10 MB (§6.4). */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Pasted text goes through the route, so it stays well under the 4.5 MB
 * request limit (§3). Files never pass through a route: the browser uploads
 * them straight to Storage.
 */
export const MAX_KNOWLEDGE_TEXT_CHARACTERS = 100_000;

/** A public key is "pk_" plus random (§6.3). */
export const PUBLIC_KEY_PATTERN = /^pk_[0-9a-f]{32}$/;

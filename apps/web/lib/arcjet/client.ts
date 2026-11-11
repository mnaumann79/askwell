import "server-only";

import arcjet, { detectPromptInjection, slidingWindow } from "@arcjet/next";

/**
 * The Arcjet clients of the public routes (docs/project.md §6.6, §9).
 *
 * The key is read from the environment and stays on the server: `ARCJET_KEY`
 * is not a `NEXT_PUBLIC_*` variable, and this module is server only.
 *
 * Without a key there is no client and so no protection. The code fails OPEN
 * on purpose — a missing key must not take the widget down — and it says so
 * in the log, once, so nobody misses it.
 */

/** How many requests a minute one public key and IP may make (§6.6). */
export const RATE_LIMIT_MAX = 20;

/** The window of the limit: a minute (§6.6). */
export const RATE_LIMIT_INTERVAL = "60s";

/**
 * What the limit counts by.
 *
 * - `ip.src` — the address of the caller.
 * - `userId` — the public key of the project, which the guard passes to
 *   `protect()`. A public key identifies a project and grants no owner rights
 *   (§9): it is a name and not a credential.
 * - `http.request.uri.path` — the route. Each public route has its own
 *   budget, so the config fetch of a page load does not eat the 20 messages
 *   a visitor may send in a minute (§6.6).
 */
const CHARACTERISTICS = ["ip.src", "userId", "http.request.uri.path"] as const;

/** Builds the clients of the app for one key. */
function createClients(key: string) {
  const base = arcjet({
    key,
    rules: [
      slidingWindow({
        mode: "LIVE",
        interval: RATE_LIMIT_INTERVAL,
        max: RATE_LIMIT_MAX,
        characteristics: [...CHARACTERISTICS],
      }),
    ],
  });

  return {
    /** The rate limit, for the routes that carry no message. */
    base,
    /** The rate limit and the injection check, for the route with a message. */
    chat: base.withRule(detectPromptInjection({ mode: "LIVE" })),
  };
}

/** The clients of the app. */
export type ArcjetClients = ReturnType<typeof createClients>;

/** The clients, built once per key. */
let clients: { key: string; value: ArcjetClients } | null = null;

/** Whether the missing key was already logged. */
let warned = false;

/**
 * The clients of the app, or null when there is no key.
 *
 * The key is read at request time, like every other secret of the app: the
 * environment of a preview is not the environment of production.
 */
export function arcjetClients(): ArcjetClients | null {
  const key = process.env.ARCJET_KEY?.trim();

  if (!key) {
    if (!warned) {
      warned = true;
      console.warn(
        "ARCJET_KEY is not set: the public routes are not rate limited and no prompt injection is detected.",
      );
    }

    return null;
  }

  if (!clients || clients.key !== key) {
    clients = { key, value: createClients(key) };
  }

  return clients.value;
}

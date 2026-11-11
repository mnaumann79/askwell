import "server-only";

import { captureMessageBlocked } from "./analytics";
import { arcjetClients } from "./client";

/**
 * The guard of the public routes (docs/project.md §6.6, §9).
 *
 * Both public routes call it — the config route and the chat route — so the
 * two cannot drift apart. It decides, it does not answer: the route keeps
 * its own shape and its own CORS headers.
 */

/** Why a request was refused. */
export type BlockReason = "rate_limit" | "injection";

/** The two refusals the guard can give. The codes are in `packages/shared`. */
export type GuardCode = "rate_limited" | "message_blocked";

/** The answer of the guard. */
export type GuardResult =
  { blocked: false } | { blocked: true; code: GuardCode; reason: BlockReason; message: string };

/** What each refusal says. */
const MESSAGES: Record<GuardCode, string> = {
  rate_limited: "Too many requests. Please try again in a minute.",
  message_blocked: "This message was blocked.",
};

/**
 * The name of a request without a public key.
 *
 * The limit counts by the public key, and a request without one still costs
 * something, so it counts under this name.
 */
const NO_KEY = "no-public-key";

/** What the guard is given. */
export interface GuardOptions {
  /** The request that is guarded. */
  request: Request;
  /** The public key of the project. `null` when the request carries none. */
  publicKey: string | null;
  /**
   * The visitor's message.
   *
   * The chat route has one and the config route has not. The injection check
   * needs the message, so the rule runs only where there is one. A route
   * that cannot read the message still guards the request — the rate limit
   * does not need it.
   */
  message?: string;
}

/**
 * Guards a request of a public route.
 *
 * Without `ARCJET_KEY` there is no protection and the request is let
 * through: the code fails open on purpose, so a missing key cannot take the
 * widget down.
 */
export async function guardPublicRequest(options: GuardOptions): Promise<GuardResult> {
  const clients = arcjetClients();

  if (!clients) {
    return { blocked: false };
  }

  const { request, publicKey, message } = options;
  const userId = publicKey ?? NO_KEY;

  const decision =
    message === undefined
      ? await clients.base.protect(request, { userId })
      : await clients.chat.protect(request, { userId, detectPromptInjectionMessage: message });

  // Arcjet fails open: a decision that errored is not a denial, and the
  // request goes through.
  if (decision.isErrored()) {
    console.error("Arcjet could not decide about the request.", decision);
    return { blocked: false };
  }

  if (!decision.isDenied()) {
    return { blocked: false };
  }

  // The guard has two rules: the rate limit and the injection check. A
  // denial that is not the rate limit comes from the injection check.
  const reason: BlockReason = decision.reason.isRateLimit() ? "rate_limit" : "injection";
  const code: GuardCode = reason === "rate_limit" ? "rate_limited" : "message_blocked";

  // A blocked message is an event (§6.6 step 1). A request without a
  // message — the config route — has no message to block, so it sends
  // nothing.
  if (message !== undefined) {
    await captureMessageBlocked({ publicKey: userId, reason });
  }

  return { blocked: true, code, reason, message: MESSAGES[code] };
}

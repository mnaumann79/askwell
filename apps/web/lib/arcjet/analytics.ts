import "server-only";

/**
 * The PostHog event of a blocked message (docs/project.md §6.6 step 1).
 *
 * A blocked message never reaches the AI, and it sends a `message_blocked`
 * event with the reason: the rate limit or the injection.
 *
 * The event is best effort. The request is refused either way, so a PostHog
 * that is down, slow or not configured must not change the answer: it is
 * logged and the refusal stands.
 */

/** The name of the event, as the docs name it. */
const EVENT = "message_blocked";

/** How long the event may take before the refusal waits no longer. */
const CAPTURE_TIMEOUT = 2_000;

/** Why the message was blocked. */
export type MessageBlockedReason = "rate_limit" | "injection";

/** Whether the missing PostHog key was already logged. */
let warned = false;

/**
 * Sends the event of a blocked message.
 *
 * The public key identifies the project the message was for, so it is the
 * distinct id of the event.
 */
export async function captureMessageBlocked(options: {
  /** The project the message was for. */
  publicKey: string;
  /** Why the message was blocked. */
  reason: MessageBlockedReason;
}): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey || !host) {
    if (!warned) {
      warned = true;
      console.warn(
        "NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_HOST is not set: the message_blocked event is not sent.",
      );
    }

    return;
  }

  try {
    const response = await fetch(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event: EVENT,
        properties: {
          distinct_id: options.publicKey,
          reason: options.reason,
        },
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT),
    });

    if (!response.ok) {
      console.error(`PostHog answered ${response.status} for the ${EVENT} event.`);
    }
  } catch (error) {
    console.error(`Could not send the ${EVENT} event.`, error);
  }
}

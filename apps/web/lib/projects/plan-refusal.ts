import type { ApiErrorCode } from "@askwell/shared";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * The refusal of the plan limits, and the answer the route builds from it
 * (docs/project.md §5, §9).
 *
 * `create_project` raises `P0001` and puts the reason in the `hint`. The
 * Data API answers 400 and hands the code, the message, the details and the
 * hint through. The route maps the hint to its own error code and builds its
 * own answer: the 400 is never passed on, because the Data API and the
 * client do not speak the same contract.
 */

/** The hints the functions raise, and the answer each one means. */
const HINT_ANSWERS: Record<string, { code: ApiErrorCode; message: string }> = {
  plan_limit_projects: {
    code: "conflict",
    message: "This plan does not allow another project.",
  },
  no_account_or_project: {
    code: "internal_error",
    message: "Could not create the project.",
  },
};

/** A refusal the route turns into an answer of its own. */
export class PlanRefusalError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "PlanRefusalError";
    this.code = code;
  }
}

/**
 * Turns the error of the Data API into the refusal it stands for.
 *
 * A hint we do not know is never guessed: it is logged and answered as an
 * internal error, so a refusal nobody wrote cannot be answered as one we did.
 */
export function refusalFrom(error: PostgrestError): PlanRefusalError {
  const hint = error.hint ?? "";
  const answer = HINT_ANSWERS[hint];

  if (answer) {
    return new PlanRefusalError(answer.code, answer.message);
  }

  console.error("Unexpected refusal from the database", {
    code: error.code,
    hint: error.hint,
    details: error.details,
    message: error.message,
  });

  return new PlanRefusalError("internal_error", "Could not create the project.");
}

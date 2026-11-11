import { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { PlanRefusalError, refusalFrom } from "./plan-refusal";

/** The error the Data API answers when a function raises a refusal. */
function refusal(hint: string): PostgrestError {
  return new PostgrestError({
    code: "P0001",
    message: "knowledge source limit reached for plan",
    details: "",
    hint,
  });
}

describe("refusalFrom", () => {
  it("answers 409 when the plan does not allow another project", () => {
    const answer = refusalFrom(refusal("plan_limit_projects"));

    expect(answer).toBeInstanceOf(PlanRefusalError);
    expect(answer.code).toBe("conflict");
    expect(answer.message).toBe("This plan does not allow another project.");
  });

  it("answers 409 when the plan does not allow another knowledge source", () => {
    const answer = refusalFrom(refusal("plan_limit_knowledge"));

    expect(answer.code).toBe("conflict");
    expect(answer.message).toBe("This plan does not allow another knowledge source.");
  });

  it("answers 500 when there is no account or project", () => {
    const answer = refusalFrom(refusal("no_account_or_project"));

    expect(answer.code).toBe("internal_error");
  });

  it("never guesses a hint it does not know", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const answer = refusalFrom(refusal("a_hint_nobody_wrote"));

    expect(answer.code).toBe("internal_error");
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });

  it("answers with the message of the caller when the hint is unknown", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const answer = refusalFrom(refusal("a_hint_nobody_wrote"), "Could not add the source.");

    expect(answer.code).toBe("internal_error");
    expect(answer.message).toBe("Could not add the source.");

    log.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./plan-limits";

describe("PLAN_LIMITS", () => {
  it("gives the free plan 1 project, 100 messages a month and 3 knowledge sources", () => {
    expect(PLAN_LIMITS.free).toEqual({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeSources: 3,
    });
  });

  it("gives the pro plan 5 projects, 2000 messages a month and 25 knowledge sources", () => {
    expect(PLAN_LIMITS.pro).toEqual({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeSources: 25,
    });
  });

  it("gives the pro plan more of everything than the free plan", () => {
    expect(PLAN_LIMITS.pro.projects).toBeGreaterThan(PLAN_LIMITS.free.projects);
    expect(PLAN_LIMITS.pro.messagesPerMonth).toBeGreaterThan(PLAN_LIMITS.free.messagesPerMonth);
    expect(PLAN_LIMITS.pro.knowledgeSources).toBeGreaterThan(PLAN_LIMITS.free.knowledgeSources);
  });
});

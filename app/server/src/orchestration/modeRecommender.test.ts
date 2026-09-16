import { describe, expect, it } from "vitest";
import { HeuristicModeRecommender, recommendMode } from "./modeRecommender.js";

/**
 * Minimal sanity tests for the ModeRecommender heuristic (Requirements 2.2, 2.1).
 * The exhaustive unit suite is optional task 2.4; these guard the core behaviors.
 */
describe("ModeRecommender", () => {
  it("recommends CrisisAction for urgent language", () => {
    expect(
      recommendMode({
        requirementText: "URGENT: range breach, need an immediate response.",
        process: "CampaignPlanning",
      }),
    ).toBe("CrisisAction");
  });

  it("recommends CrisisAction for the CrisisResponse process regardless of phrasing", () => {
    expect(
      recommendMode({
        requirementText: "Provide options.",
        process: "CrisisResponse",
      }),
    ).toBe("CrisisAction");
  });

  it("recommends Lite for a quick single-domain question", () => {
    expect(
      recommendMode({
        requirementText: "Quick question: what is the current POM cycle?",
        process: "PolicyDevelopment",
      }),
    ).toBe("Lite");
  });

  it("recommends FullStaff for a comprehensive multi-domain build", () => {
    expect(
      recommendMode({
        requirementText:
          "Build a comprehensive enterprise campaign roadmap with executive brief and storyboard.",
        process: "CampaignPlanning",
      }),
    ).toBe("FullStaff");
  });

  it("recommends FullStaff for capability assessments", () => {
    expect(
      recommendMode({
        requirementText: "Assess the unit's readiness across all domains.",
        process: "CapabilityAssessment",
      }),
    ).toBe("FullStaff");
  });

  it("defaults to Standard for an ordinary mid-weight request", () => {
    expect(
      recommendMode({
        requirementText:
          "Prepare talking points on the updated instructor billet policy for the next command staff meeting, covering the rationale, expected impact on the schoolhouse, and coordination required with the manpower shop before implementation.",
        process: "PolicyDevelopment",
      }),
    ).toBe("Standard");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      requirementText: "Draft a routine policy update memo.",
      process: "PolicyDevelopment" as const,
    };
    expect(recommendMode(input)).toBe(recommendMode(input));
  });

  it("exposes the same behavior through the class implementation", () => {
    const recommender = new HeuristicModeRecommender();
    expect(
      recommender.recommend({
        requirementText: "Emergency: casualties reported.",
        process: "PolicyDevelopment",
      }),
    ).toBe("CrisisAction");
  });
});

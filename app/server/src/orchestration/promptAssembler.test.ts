import { describe, it, expect } from "vitest";
import type {
  Assumption,
  Constraints,
  OutputStep,
  RoutingBlock,
  SourceDocument,
} from "@sage/shared";
import { PromptAssemblerImpl, HIERARCHY_OF_TRUTH } from "./promptAssembler.js";

/**
 * Minimal sanity tests for PromptAssembler (task 6.1).
 * The fuller unit-test task (6.2) is optional and lives separately.
 */

const assembler = new PromptAssemblerImpl();

const ALL_STEPS: OutputStep[] = [
  "brief",
  "storyboard",
  "sitrep",
  "cub",
  "qpr",
  "order",
  "curriculum",
];

function routing(): RoutingBlock {
  return {
    process: "CampaignPlanning",
    tier: "Strategic",
    smesToTask: [1, 17, 20],
    mode: "FullStaff",
    sequence: { kind: "sequential", order: [17, 1, 20] },
  };
}

function constraints(): Constraints {
  return { manpowerBillets: "120 billets", fundingPomCycle: "FY26-30" };
}

function assumptions(): Assumption[] {
  return [
    { field: "facilitiesRanges", text: "No range data provided; assuming current inventory." },
  ];
}

function grounding(): SourceDocument[] {
  return [
    {
      docId: "MCDP-1",
      s3Key: "docs/mcdp-1.pdf",
      fileType: "pdf",
      metadata: {
        Echelon: "Strategic",
        Domain: "Doctrine",
        Doc_Type: "Publication",
        Status: "Active",
        Topic_Tags: ["warfighting"],
      },
      extractedText: "Maneuver warfare doctrine content.",
    },
    {
      docId: "POM-BRIEF-9",
      s3Key: "docs/pom.docx",
      fileType: "docx",
      metadata: {
        Echelon: "Strategic",
        Domain: "Resourcing",
        Doc_Type: "Brief",
        Status: "Active",
        Topic_Tags: ["pom"],
      },
      extractedText: "Funding guidance content.",
    },
  ];
}

function assembleStep(step: OutputStep) {
  return assembler.assemble({
    step,
    routing: routing(),
    requirementText: "Assess UxS integration across the enterprise.",
    resolvedConstraints: constraints(),
    assumptions: assumptions(),
    grounding: grounding(),
    hierarchyOfTruth: HIERARCHY_OF_TRUTH,
  });
}

describe("PromptAssembler (Rules 3,4,6-10 / R3.2, R5.5)", () => {
  it("returns the requested step on the assembled prompt", () => {
    for (const step of ALL_STEPS) {
      expect(assembleStep(step).step).toBe(step);
    }
  });

  it("user prompt contains the routing block fields for every step", () => {
    for (const step of ALL_STEPS) {
      const { user } = assembleStep(step);
      expect(user).toContain("ROUTING BLOCK");
      expect(user).toContain("PROCESS:");
      expect(user).toContain("TIER: Strategic");
      expect(user).toContain("SMEs TO TASK: 1, 17, 20");
      expect(user).toContain("MODE: Full Staff");
      expect(user).toContain("SEQUENCE: sequential");
    }
  });

  it("user prompt injects each grounding document's Doc_ID for citation", () => {
    for (const step of ALL_STEPS) {
      const { user } = assembleStep(step);
      expect(user).toContain("[MCDP-1]");
      expect(user).toContain("[POM-BRIEF-9]");
      expect(user).toContain("GROUNDING DOCUMENTS");
    }
  });

  it("user prompt carries requirement, constraints, and explicit assumptions", () => {
    const { user } = assembleStep("brief");
    expect(user).toContain("Assess UxS integration across the enterprise.");
    expect(user).toContain("120 billets");
    expect(user).toContain("ASSUMPTIONS");
    expect(user).toContain("No range data provided");
  });

  it("system prompt encodes persona, hierarchy of truth, and strategic uplift", () => {
    const { system } = assembleStep("brief");
    expect(system).toContain("SAGE");
    expect(system).toContain("Chief of Staff");
    expect(system).toContain(
      "Legality > Doctrine/Strategy > Feasibility > Human Dynamics",
    );
    expect(system).toContain("STRATEGIC UPLIFT");
  });

  it("system prompt includes step-specific structural instructions", () => {
    expect(assembleStep("brief").system).toContain("BLUF");
    expect(assembleStep("brief").system).toContain("Recommended Action");
    expect(assembleStep("storyboard").system).toContain("six slide blueprints");
    expect(assembleStep("storyboard").system).toContain("Briefer's Script");
    expect(assembleStep("sitrep").system).toContain("EXACTLY five lines");
    expect(assembleStep("cub").system).toContain("Quad-Board");
    expect(assembleStep("qpr").system).toContain("dashboard");
    expect(assembleStep("order").system).toContain("FRAGO");
    expect(assembleStep("curriculum").system).toContain("4C-ID");
  });

  it("is deterministic: identical inputs yield identical prompts", () => {
    const a = assembleStep("brief");
    const b = assembleStep("brief");
    expect(a).toEqual(b);
  });
});

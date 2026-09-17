import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  OperationalMode,
  Tier,
  CoreProcess,
  HierarchyOfTruth,
  RoutingBlock,
  Sme,
} from "./index.js";

/**
 * Scaffolding smoke tests: confirm the shared types are importable and the
 * test runner + property-based library (fast-check) are wired up. Real
 * orchestration properties (P1–P16) are implemented in later tasks.
 */

const modes: OperationalMode[] = ["Lite", "Standard", "FullStaff", "CrisisAction"];
const tiers: Tier[] = ["Strategic", "Operational", "Tactical"];
const processes: CoreProcess[] = [
  "ProgramObjectiveMemorandum",
  "CampaignPlanning",
  "CurriculumDevelopment",
  "CapabilityAssessment",
  "CrisisResponse",
  "PolicyDevelopment",
];

describe("shared types scaffolding", () => {
  it("Tier has exactly three reconciled values (no 'Technical')", () => {
    expect(tiers).toEqual(["Strategic", "Operational", "Tactical"]);
    // @ts-expect-error "Technical" is not a valid Tier
    const bad: Tier = "Technical";
    expect(bad).toBe("Technical");
  });

  it("HierarchyOfTruth is the fixed four-element order", () => {
    const hot: HierarchyOfTruth = [
      "Legality",
      "DoctrineStrategy",
      "Feasibility",
      "HumanDynamics",
    ];
    expect(hot).toHaveLength(4);
    expect(hot[0]).toBe("Legality");
  });

  it("a RoutingBlock value is well-typed", () => {
    const sme: Sme = {
      id: 17,
      name: "Legal & Ethics Advisor (SJA)",
      tier: "Strategic",
      domains: ["Legal"],
      category: "SpecialStaff",
    };
    const block: RoutingBlock = {
      process: "PolicyDevelopment",
      tier: "Strategic",
      smesToTask: [sme.id],
      mode: "Standard",
      sequence: { kind: "sequential", order: [sme.id] },
    };
    expect(block.smesToTask).toContain(17);
  });
});

describe("fast-check is wired up", () => {
  it("holds a trivial property across all enum values", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...modes),
        fc.constantFrom(...tiers),
        fc.constantFrom(...processes),
        (mode, tier, process) => {
          return (
            modes.includes(mode) && tiers.includes(tier) && processes.includes(process)
          );
        },
      ),
    );
  });
});

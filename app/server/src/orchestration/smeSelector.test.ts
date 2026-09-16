import { describe, expect, it } from "vitest";
import { DefaultSmeSelector, selectSmes } from "./smeSelector.js";
import type { CoreProcess, OperationalMode, Tier } from "@sage/shared";

/**
 * Minimal unit tests for the SmeSelector (Requirements 3.1, 3.3, 3.4, 2.3, 2.4).
 * Exhaustive property tests are optional tasks 3.2/3.3; these guard the core
 * behaviors: Lite -> exactly one SME, FullStaff composition, determinism, and
 * Hierarchy-of-Truth ordering.
 */
describe("SmeSelector", () => {
  const processes: CoreProcess[] = [
    "ProgramObjectiveMemorandum",
    "CampaignPlanning",
    "CurriculumDevelopment",
    "CapabilityAssessment",
    "CrisisResponse",
    "PolicyDevelopment",
  ];
  const tiers: Tier[] = ["Strategic", "Operational", "Tactical"];

  it("Lite mode yields exactly one SME for every process/tier", () => {
    for (const process of processes) {
      for (const tier of tiers) {
        const { smes } = selectSmes({ process, tier, mode: "Lite" });
        expect(smes).toHaveLength(1);
      }
    }
  });

  it("FullStaff includes at least one PrimaryAdvisor and one SpecialStaff", () => {
    for (const process of processes) {
      const { smes } = selectSmes({ process, tier: "Strategic", mode: "FullStaff" });
      expect(smes.some((s) => s.category === "PrimaryAdvisor")).toBe(true);
      expect(smes.some((s) => s.category === "SpecialStaff")).toBe(true);
    }
  });

  it("returns a non-empty SME set for every mode/process/tier", () => {
    const modes: OperationalMode[] = ["Lite", "Standard", "FullStaff", "CrisisAction"];
    for (const mode of modes) {
      for (const process of processes) {
        for (const tier of tiers) {
          const { smes, sequence } = selectSmes({ process, tier, mode });
          expect(smes.length).toBeGreaterThan(0);
          expect(sequence.order).toEqual(smes.map((s) => s.id));
        }
      }
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      process: "CampaignPlanning" as const,
      tier: "Strategic" as const,
      mode: "FullStaff" as const,
    };
    const a = selectSmes(input);
    const b = selectSmes(input);
    expect(a.smes.map((s) => s.id)).toEqual(b.smes.map((s) => s.id));
    expect(a.sequence).toEqual(b.sequence);
  });

  it("orders selected SMEs by Hierarchy of Truth (ascending hierarchyRank, then id)", () => {
    const { smes } = selectSmes({
      process: "PolicyDevelopment",
      tier: "Strategic",
      mode: "FullStaff",
    });
    for (let i = 1; i < smes.length; i++) {
      const prev = smes[i - 1]!;
      const cur = smes[i]!;
      const prevRank = prev.hierarchyRank ?? 99;
      const curRank = cur.hierarchyRank ?? 99;
      // Non-decreasing rank; equal ranks tie-broken by ascending id.
      expect(prevRank).toBeLessThanOrEqual(curRank);
      if (prevRank === curRank) {
        expect(prev.id).toBeLessThan(cur.id);
      }
    }
  });

  it("places the Legality (rank 1) SME first when it is selected", () => {
    // Standard mode always includes the SJA (id 17, hierarchyRank 1).
    const { smes } = selectSmes({
      process: "PolicyDevelopment",
      tier: "Strategic",
      mode: "Standard",
    });
    expect(smes[0]!.hierarchyRank).toBe(1);
    expect(smes[0]!.id).toBe(17);
  });

  it("chooses a sequence kind per Rule 11 based on mode", () => {
    expect(
      selectSmes({ process: "CampaignPlanning", tier: "Strategic", mode: "Lite" }).sequence.kind,
    ).toBe("parallel");
    expect(
      selectSmes({ process: "CampaignPlanning", tier: "Strategic", mode: "Standard" }).sequence.kind,
    ).toBe("parallel");
    expect(
      selectSmes({ process: "CampaignPlanning", tier: "Strategic", mode: "FullStaff" }).sequence.kind,
    ).toBe("sequential");
    expect(
      selectSmes({ process: "CrisisResponse", tier: "Strategic", mode: "CrisisAction" }).sequence.kind,
    ).toBe("handoff");
  });

  it("exposes the same behavior through the class implementation", () => {
    const selector = new DefaultSmeSelector();
    const { smes } = selector.select({
      process: "CurriculumDevelopment",
      tier: "Tactical",
      mode: "Lite",
    });
    expect(smes).toHaveLength(1);
  });
});

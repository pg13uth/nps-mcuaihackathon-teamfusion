import { describe, expect, it } from "vitest";
import { DefaultRoutingBlockBuilder, buildRoutingBlock } from "./routingBlockBuilder.js";
import { selectSmes } from "./smeSelector.js";
import type { Sme, SmeSequence } from "@sage/shared";

/**
 * Minimal unit tests for the RoutingBlockBuilder (Requirements 4.1, 4.2, 4.3).
 * Property test (Property 1) is optional task 3.5 and the exact-format unit test
 * is optional task 3.6; these guard the core behaviors:
 *   - smesToTask matches the provided SME ids (Requirement 4.2)
 *   - Lite mode still identifies the single tasked SME (Requirement 4.3)
 */
describe("RoutingBlockBuilder", () => {
  it("sets smesToTask to the provided SME ids", () => {
    const { smes, sequence } = selectSmes({
      process: "CampaignPlanning",
      tier: "Strategic",
      mode: "FullStaff",
    });

    const block = buildRoutingBlock({
      process: "CampaignPlanning",
      tier: "Strategic",
      mode: "FullStaff",
      smes,
      sequence,
    });

    // Same id set as the provided SMEs (order may follow the sequence).
    expect([...block.smesToTask].sort((a, b) => a - b)).toEqual(
      [...smes.map((s) => s.id)].sort((a, b) => a - b),
    );
    // Every id in smesToTask is a member of the provided SMEs (Property 1).
    const providedIds = new Set(smes.map((s) => s.id));
    for (const id of block.smesToTask) {
      expect(providedIds.has(id)).toBe(true);
    }
  });

  it("orders smesToTask by the sequence order where available", () => {
    const smes: Sme[] = [
      { id: 5, name: "A", tier: "Strategic", domains: [], category: "PrimaryAdvisor" },
      { id: 17, name: "B", tier: "Strategic", domains: [], category: "SpecialStaff" },
      { id: 20, name: "C", tier: "Strategic", domains: [], category: "TechnicalSme" },
    ];
    const sequence: SmeSequence = { kind: "sequential", order: [17, 20, 5] };

    const block = buildRoutingBlock({
      process: "PolicyDevelopment",
      tier: "Strategic",
      mode: "Standard",
      smes,
      sequence,
    });

    expect(block.smesToTask).toEqual([17, 20, 5]);
  });

  it("Lite mode still identifies the single tasked SME", () => {
    const { smes, sequence } = selectSmes({
      process: "CurriculumDevelopment",
      tier: "Tactical",
      mode: "Lite",
    });
    expect(smes).toHaveLength(1);

    const block = buildRoutingBlock({
      process: "CurriculumDevelopment",
      tier: "Tactical",
      mode: "Lite",
      smes,
      sequence,
    });

    expect(block.smesToTask).toHaveLength(1);
    expect(block.smesToTask[0]).toBe(smes[0]!.id);
    expect(block.mode).toBe("Lite");
  });

  it("carries PROCESS / TIER / MODE / SEQUENCE through unchanged", () => {
    const smes: Sme[] = [
      { id: 8, name: "A", tier: "Operational", domains: [], category: "PrimaryAdvisor" },
    ];
    const sequence: SmeSequence = { kind: "parallel", order: [8] };

    const block = buildRoutingBlock({
      process: "ProgramObjectiveMemorandum",
      tier: "Operational",
      mode: "Standard",
      smes,
      sequence,
    });

    expect(block.process).toBe("ProgramObjectiveMemorandum");
    expect(block.tier).toBe("Operational");
    expect(block.mode).toBe("Standard");
    expect(block.sequence).toEqual(sequence);
  });

  it("is deterministic for identical inputs", () => {
    const { smes, sequence } = selectSmes({
      process: "CrisisResponse",
      tier: "Strategic",
      mode: "CrisisAction",
    });
    const input = {
      process: "CrisisResponse" as const,
      tier: "Strategic" as const,
      mode: "CrisisAction" as const,
      smes,
      sequence,
    };
    expect(buildRoutingBlock(input)).toEqual(buildRoutingBlock(input));
  });

  it("exposes the same behavior through the class implementation", () => {
    const builder = new DefaultRoutingBlockBuilder();
    const { smes, sequence } = selectSmes({
      process: "CapabilityAssessment",
      tier: "Strategic",
      mode: "Lite",
    });
    const block = builder.build({
      process: "CapabilityAssessment",
      tier: "Strategic",
      mode: "Lite",
      smes,
      sequence,
    });
    expect(block.smesToTask).toHaveLength(1);
  });
});

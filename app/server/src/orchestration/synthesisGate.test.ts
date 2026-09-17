import { describe, it, expect } from "vitest";
import type { SourceDocument } from "@sage/shared";
import { SynthesisGateImpl } from "./synthesisGate.js";

/**
 * Unit tests for the SynthesisGate (Rule 15 / Requirements 11.1, 11.2).
 * Covers the all-pass case and each of the four checks failing individually,
 * confirming `passed` is true iff all four pass and that failures are flagged.
 */

const gate = new SynthesisGateImpl();

function doc(docId: string): SourceDocument {
  return {
    docId,
    s3Key: `Agents/${docId}.docx`,
    fileType: "docx",
    metadata: {
      Echelon: "Strategic",
      Domain: "Doctrine",
      Doc_Type: "Order",
      Status: "Active",
      Topic_Tags: ["learning"],
    },
    extractedText: "…",
  };
}

const grounding: SourceDocument[] = [doc("MCDP-7"), doc("TE-2030")];

/** A brief that satisfies all four checks. */
const PASSING_BRIEF = [
  "Sir/Ma'am, we must approve the enterprise-level sUAS syllabus expansion.",
  "Strategic Context: This aligns with Force Design 2030 and TECOM cognitive overmatch goals [MCDP-7].",
  "Synthesized Analysis: Enterprise impact spans the campaign plan [TE-2030, p. 4].",
  "Assumptions & Limitations: Legal review complete and cleared.",
  "Recommended Action: Approve COA A (fund now) or COA B (defer to next POM).",
].join("\n");

describe("SynthesisGate — all checks pass", () => {
  it("returns passed=true with every gate item passing", () => {
    const result = gate.run({ briefText: PASSING_BRIEF, grounding });
    expect(result.legalClearance.passed).toBe(true);
    expect(result.strategicUplift.passed).toBe(true);
    expect(result.citationVerification.passed).toBe(true);
    expect(result.binaryDecisionPoint.passed).toBe(true);
    expect(result.passed).toBe(true);
  });
});

describe("SynthesisGate — each check fails individually", () => {
  it("fails Legal Clearance on an unresolved legal signal (others pass)", () => {
    const brief = PASSING_BRIEF.replace(
      "Legal review complete and cleared.",
      "Legal review required before execution; awaiting SJA.",
    );
    const result = gate.run({ briefText: brief, grounding });

    expect(result.legalClearance.passed).toBe(false);
    expect(result.legalClearance.detail).toMatch(/legal/i);
    // The other three still pass, isolating the failure.
    expect(result.strategicUplift.passed).toBe(true);
    expect(result.citationVerification.passed).toBe(true);
    expect(result.binaryDecisionPoint.passed).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("fails Strategic Uplift when raw lower-echelon data is not elevated", () => {
    const brief = [
      "Sir/Ma'am, we must approve COA A or COA B.",
      "See attached spreadsheet with the raw data from the instructor grading formula.",
      "Legal review complete and cleared.",
    ].join("\n");
    const result = gate.run({ briefText: brief, grounding });

    expect(result.strategicUplift.passed).toBe(false);
    expect(result.strategicUplift.detail).toMatch(/uplift/i);
    // Isolate: legal, citations (none), binary all pass.
    expect(result.legalClearance.passed).toBe(true);
    expect(result.citationVerification.passed).toBe(true);
    expect(result.binaryDecisionPoint.passed).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("fails Citation Verification on a citation not in the grounding set", () => {
    const brief = PASSING_BRIEF.replace("[MCDP-7]", "[GHOST-DOC-99]");
    const result = gate.run({ briefText: brief, grounding });

    expect(result.citationVerification.passed).toBe(false);
    expect(result.citationVerification.detail).toMatch(/GHOST-DOC-99/);
    // Isolate: legal, uplift, binary all pass.
    expect(result.legalClearance.passed).toBe(true);
    expect(result.strategicUplift.passed).toBe(true);
    expect(result.binaryDecisionPoint.passed).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("fails Binary Decision Point when no binary recommended action is present", () => {
    const brief = PASSING_BRIEF.replace(
      "Recommended Action: Approve COA A (fund now) or COA B (defer to next POM).",
      "Recommended Action: Continue monitoring and reassess as conditions evolve.",
    );
    const result = gate.run({ briefText: brief, grounding });

    expect(result.binaryDecisionPoint.passed).toBe(false);
    expect(result.binaryDecisionPoint.detail).toMatch(/binary/i);
    // Isolate: legal, uplift, citations all pass.
    expect(result.legalClearance.passed).toBe(true);
    expect(result.strategicUplift.passed).toBe(true);
    expect(result.citationVerification.passed).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe("SynthesisGate — edge cases", () => {
  it("treats a brief with no citations as passing Citation Verification", () => {
    const brief = [
      "Sir/Ma'am, we must approve COA A or COA B for the enterprise realignment.",
      "Legal review complete and cleared.",
    ].join("\n");
    const result = gate.run({ briefText: brief, grounding: [] });
    expect(result.citationVerification.passed).toBe(true);
  });

  it("ignores bare page-number tokens inside citations", () => {
    const brief = [
      "Sir/Ma'am, we must approve COA A or COA B for the strategic initiative.",
      "Analysis grounded in doctrine [MCDP-7, p. 12].",
      "Legal review complete and cleared.",
    ].join("\n");
    const result = gate.run({ briefText: brief, grounding });
    expect(result.citationVerification.passed).toBe(true);
    expect(result.passed).toBe(true);
  });
});

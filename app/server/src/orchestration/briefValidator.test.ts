import { describe, it, expect } from "vitest";
import { validateBrief } from "./briefValidator.js";

/**
 * Unit tests for the brief validator (Rule 6 / Requirements 5.1–5.4).
 * Covers a correct brief, a brief missing the BLUF section, and an
 * out-of-order brief.
 */

/** A brief that satisfies all Rule 6 checks. */
const VALID_BRIEF = [
  "BLUF: Sir/Ma'am, we must approve the enterprise sUAS syllabus now. Delay concedes cognitive overmatch to the adversary.",
  "",
  "Strategic Context: This aligns with Force Design 2030 and TECOM priorities.",
  "",
  "Synthesized Analysis: The enterprise impact spans the campaign plan and readiness.",
  "",
  "Assumptions & Limitations: Assumes current T/O steady-state; legal review complete.",
  "",
  "Risk Assessment: Primary risk is schedule slippage against IOC.",
  "",
  "Resource & Policy Implications: Requires manpower/T-O billets, POM funding, and MILCON range capacity.",
  "",
  "Recommended Action: Approve COA A (fund now) or COA B (defer to next POM).",
].join("\n");

describe("validateBrief — correct brief", () => {
  it("returns valid=true with no violations for a well-formed brief", () => {
    const result = validateBrief(VALID_BRIEF);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("validateBrief — missing BLUF", () => {
  it("flags the missing BLUF section", () => {
    const withoutBluf = VALID_BRIEF.split("\n")
      .filter((line) => !line.startsWith("BLUF:"))
      .join("\n");
    const result = validateBrief(withoutBluf);

    expect(result.valid).toBe(false);
    expect(result.violations).toContain("Missing required section: BLUF");
  });
});

describe("validateBrief — out of order", () => {
  it("flags a section that appears out of the Rule 6 order", () => {
    // Swap Strategic Context and Synthesized Analysis order.
    const reordered = [
      "BLUF: Sir/Ma'am, we must approve the enterprise sUAS syllabus now. Delay concedes overmatch.",
      "",
      "Synthesized Analysis: The enterprise impact spans the campaign plan and readiness.",
      "",
      "Strategic Context: This aligns with Force Design 2030 and TECOM priorities.",
      "",
      "Assumptions & Limitations: Assumes current T/O steady-state; legal review complete.",
      "",
      "Risk Assessment: Primary risk is schedule slippage against IOC.",
      "",
      "Resource & Policy Implications: Requires manpower/T-O billets, POM funding, and MILCON range capacity.",
      "",
      "Recommended Action: Approve COA A (fund now) or COA B (defer to next POM).",
    ].join("\n");

    const result = validateBrief(reordered);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("out of order"))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import type { Constraints } from "@sage/shared";
import { DefaultConstraintResolver } from "./constraint-resolver.js";

/**
 * Unit tests for the ConstraintResolver (Requirement 1.3).
 * The universal property (Property 4) is covered by the optional property
 * test in task 2.2; these tests pin down representative behavior.
 */

const resolver = new DefaultConstraintResolver();

describe("DefaultConstraintResolver", () => {
  it("passes present constraint fields through unchanged and emits no assumptions", () => {
    const input: Constraints = {
      manpowerBillets: "1200 billets, 95% filled",
      fundingPomCycle: "POM-27",
      facilitiesRanges: "Range Alpha, Range Bravo",
    };

    const { resolved, assumptions } = resolver.resolve(input);

    expect(resolved).toEqual(input);
    expect(assumptions).toEqual([]);
  });

  it("converts every undefined field into an assumption and leaves resolved unset", () => {
    const { resolved, assumptions } = resolver.resolve({});

    // No fabricated values.
    expect(resolved.manpowerBillets).toBeUndefined();
    expect(resolved.fundingPomCycle).toBeUndefined();
    expect(resolved.facilitiesRanges).toBeUndefined();

    // Exactly one assumption per blank field.
    expect(assumptions).toHaveLength(3);
    const fields = assumptions.map((a) => a.field).sort();
    expect(fields).toEqual(["facilitiesRanges", "fundingPomCycle", "manpowerBillets"]);
    for (const a of assumptions) {
      expect(a.text.trim()).not.toBe("");
    }
  });

  it("treats whitespace-only fields as blank", () => {
    const { resolved, assumptions } = resolver.resolve({
      manpowerBillets: "   ",
      fundingPomCycle: "\t\n",
      facilitiesRanges: "Range Alpha",
    });

    // Whitespace-only fields are blank; the genuinely present field passes through.
    expect(resolved.manpowerBillets).toBeUndefined();
    expect(resolved.fundingPomCycle).toBeUndefined();
    expect(resolved.facilitiesRanges).toBe("Range Alpha");
    expect(assumptions.map((a) => a.field).sort()).toEqual([
      "fundingPomCycle",
      "manpowerBillets",
    ]);
  });

  it("handles a mix of present and blank fields", () => {
    const { resolved, assumptions } = resolver.resolve({
      manpowerBillets: "800 billets",
      // fundingPomCycle omitted (blank)
      facilitiesRanges: "",
    });

    expect(resolved.manpowerBillets).toBe("800 billets");
    expect(resolved.fundingPomCycle).toBeUndefined();
    expect(resolved.facilitiesRanges).toBeUndefined();

    expect(assumptions.map((a) => a.field).sort()).toEqual([
      "facilitiesRanges",
      "fundingPomCycle",
    ]);
  });
});

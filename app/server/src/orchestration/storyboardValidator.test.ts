import { describe, expect, it } from "vitest";
import { validateStoryboard } from "./storyboardValidator.js";

/**
 * Minimal unit tests for the 6-Slide UxS IPR storyboard validator.
 * Requirements: 6.1, 6.2, 6.3, 6.4.
 */

/** A well-formed 6-slide storyboard within all per-slide word limits. */
const WELL_FORMED = `
Slide 1: Agenda & BLUF
- Visual Layout: Title band over three stacked bullets, TECOM seal top-right.
- SAGE Text Constraint:
  - Decision needed on UxS course fielding timeline
  - BLUF states enterprise impact in one line
  - Agenda lists five briefing segments clearly
- Briefer's Script: Sir, we must decide the fielding timeline today.

Slide 2: Strategic Context & Problem Frame
- Visual Layout: Left context panel, right problem-frame callout box.
- SAGE Text Constraint: Frame the enterprise gap succinctly.
- Briefer's Script: The strategic context is a widening cognitive overmatch gap.

Slide 3: Framework
- Visual Layout: Horizontal chevron process flow, five stages.
- SAGE Text Constraint:
  - Assess requirement
  - Design curriculum
  - Resource the plan
  - Execute fielding
  - Evaluate outcomes
- Briefer's Script: Our framework moves left to right across five stages.

Slide 4: Resource Implications
- Visual Layout: Holy Trinity three-column table (Manpower, Funding, Facilities).
- SAGE Text Constraint: Show billets, POM line, and range impact.
- Briefer's Script: Resourcing hinges on billets, POM funding, and range access.

Slide 5: Way Ahead
- Visual Layout: Timeline ribbon with three milestones.
- SAGE Text Constraint: Milestones tied to POM cycle.
- Briefer's Script: The way ahead sequences three milestones over the POM.

Slide 6: Decision Board
- Visual Layout: Two-column COA comparison with recommendation banner.
- SAGE Text Constraint: Present COA A versus COA B.
- Briefer's Script: I recommend COA A; request your approval or disapproval.
`;

/** A 5-slide storyboard (Decision Board omitted). */
const FIVE_SLIDES = `
Slide 1: Agenda & BLUF
- Visual Layout: Title band over three bullets.
- SAGE Text Constraint: Decision needed today.
- Briefer's Script: Sir, we must decide today.

Slide 2: Strategic Context & Problem Frame
- Visual Layout: Context panel.
- SAGE Text Constraint: Frame the gap.
- Briefer's Script: The context is a widening gap.

Slide 3: Framework
- Visual Layout: Chevron flow.
- SAGE Text Constraint: Assess then design.
- Briefer's Script: Left to right across stages.

Slide 4: Resource Implications
- Visual Layout: Three-column table.
- SAGE Text Constraint: Billets, funding, facilities.
- Briefer's Script: Resourcing hinges on the Holy Trinity.

Slide 5: Way Ahead
- Visual Layout: Timeline ribbon.
- SAGE Text Constraint: Milestones tied to POM.
- Briefer's Script: Three milestones over the POM.
`;

describe("validateStoryboard", () => {
  it("accepts a well-formed 6-slide storyboard in the prescribed sequence", () => {
    const result = validateStoryboard(WELL_FORMED, { tier: "Strategic" });
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a 5-slide storyboard and names the wrong slide count", () => {
    const result = validateStoryboard(FIVE_SLIDES);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /exactly 6 slide blueprints, found 5/i.test(v))).toBe(
      true,
    );
  });

  it("flags a missing required component (no Briefer's Script)", () => {
    const missingScript = WELL_FORMED.replace(
      "- Briefer's Script: Sir, we must decide the fielding timeline today.",
      "",
    );
    const result = validateStoryboard(missingScript);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /missing Briefer's Script/i.test(v))).toBe(true);
  });

  it("flags a Slide 1 bullet exceeding the 15-word limit", () => {
    const longBullet = WELL_FORMED.replace(
      "  - Decision needed on UxS course fielding timeline",
      "  - Decision needed on the UxS course fielding timeline because the enterprise cannot sustain the current cognitive overmatch gap anymore today",
    );
    const result = validateStoryboard(longBullet);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /Slide 1.*15-word limit/i.test(v))).toBe(true);
  });

  it("flags an out-of-sequence slide", () => {
    const swapped = WELL_FORMED.replace("Slide 1: Agenda & BLUF", "Slide 1: Decision Board");
    const result = validateStoryboard(swapped);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /Slide 1 out of sequence/i.test(v))).toBe(true);
  });
});

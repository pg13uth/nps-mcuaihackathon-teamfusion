import { describe, it, expect } from "vitest";
import {
  validateSitrep,
  validateCub,
  validateQpr,
  validateOrder,
  validateCurriculum,
} from "./reportValidators.js";

/**
 * Minimal sanity unit tests for the battle-rhythm, orders, and curriculum
 * validators (task 7.5). One canonical good + bad case per validator, with an
 * extra good/bad pair for the SITREP 5-line rule (Requirement 7.1).
 * Broader coverage lives in the optional tasks 7.6 (property) and 7.7 (units).
 */

// --- SITREP (Requirement 7.1) ---------------------------------------------

const GOOD_SITREP = [
  "Overall: GREEN — training on track.",
  "Last 24: Completed sUAS block 2 for Company A.",
  "Next 24: Begin block 3; range recon at 0700.",
  "Issues: One instructor on emergency leave.",
  "Coordination: G-4 to confirm Range Alpha availability.",
].join("\n");

describe("validateSitrep (Requirement 7.1)", () => {
  it("accepts an exact 5-line report in order", () => {
    const r = validateSitrep(GOOD_SITREP);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects a report with extra conversational text (more than 5 lines)", () => {
    const bad = [
      "Sir, here is today's update:",
      ...GOOD_SITREP.split("\n"),
    ].join("\n");
    const r = validateSitrep(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /exactly 5 lines/i.test(v))).toBe(true);
  });

  it("rejects a report missing lines", () => {
    const bad = ["Overall: GREEN.", "Last 24: Did work."].join("\n");
    const r = validateSitrep(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /Next 24/i.test(v))).toBe(true);
    expect(r.violations.some((v) => /Coordination/i.test(v))).toBe(true);
  });
});

// --- CUB (Requirement 7.2) ------------------------------------------------

const GOOD_CUB = [
  "WEEKLY CUB — QUAD-BOARD BLUEPRINT",
  "Quadrant 1 — LOEs (Lines of Effort): LOE 1 Force Design integration.",
  "Quadrant 2 — Performance Metrics (RAG): Throughput AMBER; Readiness GREEN.",
  "Quadrant 3 — Accomplishments: Fielded sUAS syllabus v2.",
  "Quadrant 4 — Decisions Required: Approve additional range days.",
].join("\n");

describe("validateCub (Requirement 7.2)", () => {
  it("accepts a complete Quad-Board blueprint", () => {
    const r = validateCub(GOOD_CUB);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects a board missing a quadrant", () => {
    const bad = GOOD_CUB.replace(
      "Quadrant 4 — Decisions Required: Approve additional range days.",
      "",
    );
    const r = validateCub(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /Decisions Required/i.test(v))).toBe(true);
  });
});

// --- QPR (Requirement 7.3) ------------------------------------------------

const GOOD_QPR = [
  "QUARTERLY PROGRESS REPORT (QPR) — DASHBOARD BLUEPRINT",
  "Progress measured against Campaign Plan objectives.",
  "Objective 1 (LOE 1): 72% complete — on track.",
  "Objective 2 (LOE 2): 45% complete — behind track; metric trending down.",
].join("\n");

describe("validateQpr (Requirement 7.3)", () => {
  it("accepts a data-driven dashboard tied to the Campaign Plan", () => {
    const r = validateQpr(GOOD_QPR);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects a narrative with no Campaign Plan reference or data", () => {
    const bad = "Things are going well this quarter overall and morale is high.";
    const r = validateQpr(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /Campaign Plan/i.test(v))).toBe(true);
    expect(r.violations.some((v) => /data-driven/i.test(v))).toBe(true);
  });
});

// --- Order (Requirements 8.1, 8.2, 8.3) -----------------------------------

const GOOD_ORDER = [
  "FRAGO 003-25 TO TECOM OPORD 01-25",
  "1. Situation. Expansion of sUAS instruction directed by CG.",
  "2. Mission. Schoolhouse fields the revised syllabus NLT next quarter.",
  "3. Execution.",
  "   a. G-3 tasked to publish the revised POI. Suspense: 15 MAR.",
  "   b. G-4 responsible for range allocation. Suspense: 20 MAR.",
  "4. Administration and Logistics. Funding from current POM.",
  "5. Command and Signal. POC: S-3 Operations.",
].join("\n");

describe("validateOrder (Requirements 8.1, 8.2, 8.3)", () => {
  it("accepts a FRAGO with responsibilities, suspenses, and 5-paragraph structure", () => {
    const r = validateOrder(GOOD_ORDER);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects prose lacking tasking form, suspenses, and correspondence structure", () => {
    const bad = "We should probably expand the sUAS course at some point soon.";
    const r = validateOrder(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /FRAGO|tasking/i.test(v))).toBe(true);
    expect(r.violations.some((v) => /suspense/i.test(v))).toBe(true);
  });
});

// --- Curriculum (Requirements 9.1, 9.2, 9.3) ------------------------------

const GOOD_CURRICULUM = [
  "CURRICULUM PACKAGE — sUAS EMPLOYMENT",
  "TLO 1: Condition — Given a fielded sUAS and a tactical scenario;",
  "  Behavior — the student will employ the system;",
  "  Standard — IAW the approved TTPs with zero safety violations.",
  "ELO 1.1: Condition/Behavior/Standard as above at the task level.",
  "Assessment: BARS (Behaviorally Anchored Rating Scale) anchors 1-5.",
  "Lesson structure follows the 4C-ID framework (learning tasks, supportive",
  "information, procedural information, part-task practice).",
].join("\n");

describe("validateCurriculum (Requirements 9.1, 9.2, 9.3)", () => {
  it("accepts CBS objectives with BARS and 4C-ID structure", () => {
    const r = validateCurriculum(GOOD_CURRICULUM);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects materials missing BARS and 4C-ID", () => {
    const bad = [
      "TLO 1: Condition given a scenario, Behavior perform the task, Standard per doctrine.",
    ].join("\n");
    const r = validateCurriculum(bad);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /BARS/i.test(v))).toBe(true);
    expect(r.violations.some((v) => /4C-ID/i.test(v))).toBe(true);
  });
});

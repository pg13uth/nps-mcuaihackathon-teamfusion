import { describe, it, expect } from "vitest";
import type { Constraints, RunningEstimate } from "@sage/shared";
import { CcirEngineImpl } from "./ccirEngine.js";

/**
 * Unit tests for the CcirEngine (Rule 13 / Requirements 13.1, 13.2).
 *
 * For each of the four CCIR categories we assert that:
 *   - an input that meets the documented threshold fires an alert of that
 *     category, carrying a non-empty triggering condition and recommended
 *     action (Requirement 13.1, 13.2), and
 *   - an input below the threshold does NOT fire that category
 *     (design Property 15: fire iff threshold met).
 */

const engine = new CcirEngineImpl();

/** A clean, sub-threshold running estimate (nothing should fire). */
function healthyEstimate(): RunningEstimate {
  return {
    billetBalance: "Manning at 96%; all key billets filled.",
    fundingStatus: "FY execution nominal; 45% obligated against plan.",
    activeCcirAlerts: [],
    revisions: [],
  };
}

/** A clean, sub-threshold constraints set (nothing should fire). */
function healthyConstraints(): Constraints {
  return {
    manpowerBillets: "T/O steady-state; manning at 94%.",
    fundingPomCycle: "POM on track; 50% obligated, funds available.",
    facilitiesRanges: "Ranges available; supply availability at 92%.",
  };
}

function categories(alerts: { category: string }[]): string[] {
  return alerts.map((a) => a.category);
}

describe("CcirEngine — no alerts below any threshold", () => {
  it("emits zero alerts for healthy inputs", () => {
    const alerts = engine.evaluate({
      constraints: healthyConstraints(),
      estimate: healthyEstimate(),
    });
    expect(alerts).toEqual([]);
  });
});

describe("CcirEngine — PersonnelReadiness", () => {
  it("fires when manning is below 80%", () => {
    const alerts = engine.evaluate({
      constraints: { ...healthyConstraints(), manpowerBillets: "Manning at 72%." },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("PersonnelReadiness");
    const alert = alerts.find((a) => a.category === "PersonnelReadiness")!;
    expect(alert.triggeringCondition).not.toBe("");
    expect(alert.recommendedAction).not.toBe("");
  });

  it("fires on a critical shortfall marker regardless of percentage", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        manpowerBillets: "Two gapped billets in the key leadership cell.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("PersonnelReadiness");
  });

  it("does NOT fire when manning is at or above 80%", () => {
    const alerts = engine.evaluate({
      constraints: { ...healthyConstraints(), manpowerBillets: "Manning at 85%." },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).not.toContain("PersonnelReadiness");
  });
});

describe("CcirEngine — ThreatOvermatch", () => {
  it("fires when a threat-overmatch signal is present", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        manpowerBillets: "Adversary overmatch in the sUAS domain noted.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("ThreatOvermatch");
    const alert = alerts.find((a) => a.category === "ThreatOvermatch")!;
    expect(alert.triggeringCondition).not.toBe("");
    expect(alert.recommendedAction).not.toBe("");
  });

  it("does NOT fire when no threat signal is present", () => {
    const alerts = engine.evaluate({
      constraints: healthyConstraints(),
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).not.toContain("ThreatOvermatch");
  });
});

describe("CcirEngine — LogisticsFailure", () => {
  it("fires when supply availability is below 70%", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        facilitiesRanges: "Supply availability at 55% this quarter.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("LogisticsFailure");
    const alert = alerts.find((a) => a.category === "LogisticsFailure")!;
    expect(alert.triggeringCondition).not.toBe("");
    expect(alert.recommendedAction).not.toBe("");
  });

  it("fires on a logistics shortfall marker", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        facilitiesRanges: "Range Alpha unavailable; materiel shortfall reported.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("LogisticsFailure");
  });

  it("does NOT fire when supply availability is at or above 70%", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        facilitiesRanges: "Supply availability at 88%; ranges open.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).not.toContain("LogisticsFailure");
  });
});

describe("CcirEngine — FiscalLaw", () => {
  it("fires on an over-obligation / Anti-Deficiency risk marker", () => {
    const alerts = engine.evaluate({
      constraints: {
        ...healthyConstraints(),
        fundingPomCycle: "Projected over-obligation of the O&M appropriation.",
      },
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).toContain("FiscalLaw");
    const alert = alerts.find((a) => a.category === "FiscalLaw")!;
    expect(alert.triggeringCondition).not.toBe("");
    expect(alert.recommendedAction).not.toBe("");
  });

  it("fires when obligation exceeds 100%", () => {
    const alerts = engine.evaluate({
      constraints: healthyConstraints(),
      estimate: {
        ...healthyEstimate(),
        fundingStatus: "Currently obligated 105% against available funds.",
      },
    });
    expect(categories(alerts)).toContain("FiscalLaw");
  });

  it("does NOT fire when funding is nominal and within appropriation", () => {
    const alerts = engine.evaluate({
      constraints: healthyConstraints(),
      estimate: healthyEstimate(),
    });
    expect(categories(alerts)).not.toContain("FiscalLaw");
  });
});

describe("CcirEngine — multiple categories", () => {
  it("fires several alerts when multiple thresholds are met", () => {
    const alerts = engine.evaluate({
      constraints: {
        manpowerBillets: "Manning at 60%; understrength.",
        fundingPomCycle: "Anti-deficiency risk; over-obligated.",
        facilitiesRanges: "Range closed; supply shortfall.",
      },
      estimate: healthyEstimate(),
    });
    const cats = categories(alerts);
    expect(cats).toContain("PersonnelReadiness");
    expect(cats).toContain("LogisticsFailure");
    expect(cats).toContain("FiscalLaw");
    // Every emitted alert carries both fields (Requirement 13.2).
    for (const a of alerts) {
      expect(a.triggeringCondition.length).toBeGreaterThan(0);
      expect(a.recommendedAction.length).toBeGreaterThan(0);
    }
  });
});

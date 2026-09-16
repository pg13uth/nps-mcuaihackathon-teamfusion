import type {
  CcirAlert,
  CcirCategory,
  CcirEngine,
  Constraints,
  RunningEstimate,
} from "@sage/shared";

/**
 * CcirEngine — Rule 13 proactive CCIR (Commander's Critical Information
 * Requirements) threshold evaluation.
 *
 * Requirements:
 *  - 13.1: WHEN input data meets a CCIR threshold (personnel readiness,
 *          threat overmatch, logistics failure, fiscal law) THEN the system
 *          SHALL display a prominent alert.
 *  - 13.2: WHEN a CCIR alert fires THEN it SHALL identify the triggering
 *          condition and a recommended immediate action.
 *
 * This is pure orchestration logic: given the task `constraints` (free-text
 * fields captured at intake) and the persisted `RunningEstimate`, it emits an
 * ordered `CcirAlert[]`. It performs no I/O and does not mutate its inputs.
 *
 * Design Property 15 (CCIR alerts fire exactly at thresholds):
 *   thresholdMet(cat, input) ⇔ (∃ a ∈ alerts. a.category = cat)
 *   ∀ a ∈ alerts. a.triggeringCondition ≠ "" ∧ a.recommendedAction ≠ ""
 * i.e. each category fires an alert if and only if its documented threshold is
 * met, and every emitted alert carries a non-empty triggering condition and a
 * non-empty recommended action.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISTIC THRESHOLDS (documented so downstream reviewers understand
 * exactly what fires each category). Inputs are free-text, so evaluation uses
 * deterministic parsing/heuristics against the pooled text of the relevant
 * constraint field(s) plus the running estimate. All matching is
 * case-insensitive.
 *
 * The pooled text scanned per category is:
 *   - PersonnelReadiness : constraints.manpowerBillets + estimate.billetBalance
 *   - ThreatOvermatch    : constraints (all fields) + estimate (billet+funding)
 *   - LogisticsFailure   : constraints.facilitiesRanges + estimate.billetBalance
 *   - FiscalLaw          : constraints.fundingPomCycle + estimate.fundingStatus
 *
 * 1. PersonnelReadiness
 *    Fires when readiness is critically degraded. Triggers:
 *      (a) an explicit readiness/manning/fill percentage below 80%
 *          (e.g. "manning at 72%", "readiness 65 %"), OR
 *      (b) an explicit critical-shortfall marker
 *          ("gapped billet", "critical manning shortfall", "unfilled billet",
 *           "T/O shortfall", "understrength", "non-deployable", "C4" readiness).
 *    Rationale: 80% fill is the conventional floor below which a unit is
 *    considered not fully mission-capable; explicit critical markers fire
 *    regardless of any stated percentage.
 *
 * 2. ThreatOvermatch
 *    Fires when a threat/adversary-overmatch signal is present. Triggers on
 *    markers such as "threat overmatch", "adversary overmatch", "capability
 *    gap", "outpaced/outmatched by [the] threat", "peer threat", "overmatched",
 *    "red force advantage". Any such signal fires the alert.
 *
 * 3. LogisticsFailure
 *    Fires when supply/materiel/facilities indicate a shortfall. Triggers on
 *      (a) an explicit supply/materiel/range availability percentage below 70%
 *          (e.g. "supply availability 55%", "materiel readiness at 60 %"), OR
 *      (b) a shortfall marker ("supply shortfall", "materiel shortfall",
 *          "logistics failure", "range unavailable/closed", "stockout",
 *          "parts shortage", "cannot sustain", "unsupportable",
 *          "MILCON shortfall").
 *
 * 4. FiscalLaw
 *    Fires on an Anti-Deficiency Act (31 U.S.C. §1341) / fiscal-law risk —
 *    i.e. any signal of over-obligation or spending beyond available funds.
 *    Triggers on markers such as "over-obligat*", "over-obligation",
 *    "anti-deficiency", "ADA violation", "unfunded", "exceeds appropriation",
 *    "insufficient funds", "shortfall in funding", "purpose/time/amount
 *    violation", or an explicit obligation percentage over 100%
 *    (e.g. "obligated 105%").
 * ---------------------------------------------------------------------------
 */

/** A category evaluator: returns the matched triggering phrase, or undefined. */
interface CategoryEvaluation {
  category: CcirCategory;
  trigger: string | undefined;
  recommendedAction: string;
}

/** Case-insensitive "does any pattern match" that also returns the match text. */
function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m) return m[0];
  }
  return undefined;
}

/**
 * Return the first percentage in `text` (as a number 0..N) that satisfies
 * `predicate`, when it is attached to any of the given context keywords.
 * Example: contextPercentBelow(text, ["manning","readiness","fill"], 80)
 * matches "manning at 72%" -> 72.
 */
function contextPercentMatch(
  text: string,
  keywords: string[],
  predicate: (pct: number) => boolean,
): string | undefined {
  const kw = keywords.join("|");
  // keyword ... number% within a short window, OR number% ... keyword
  const patterns = [
    new RegExp(`(?:${kw})[^%\\d]{0,24}?(\\d{1,3})\\s*%`, "i"),
    new RegExp(`(\\d{1,3})\\s*%[^%\\d]{0,24}?(?:${kw})`, "i"),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m) {
      const pct = Number.parseInt(m[1] ?? "", 10);
      if (Number.isFinite(pct) && predicate(pct)) {
        return m[0];
      }
    }
  }
  return undefined;
}

const PERSONNEL_CRITICAL_MARKERS: RegExp[] = [
  /\bgapped\s+billet/i,
  /\bcritical\s+manning\s+shortfall\b/i,
  /\bunfilled\s+billet/i,
  /\bt\/o\s+shortfall\b/i,
  /\bunderstrength\b/i,
  /\bnon[-\s]?deployable\b/i,
  /\bc4\s+readiness\b/i,
];

const THREAT_MARKERS: RegExp[] = [
  /\bthreat\s+overmatch\b/i,
  /\badversary\s+overmatch\b/i,
  /\bcapability\s+gap\b/i,
  /\bout(?:paced|matched)\s+by\s+(?:the\s+)?threat\b/i,
  /\bpeer\s+threat\b/i,
  /\bovermatch(?:ed)?\b/i,
  /\bred\s+force\s+advantage\b/i,
];

const LOGISTICS_MARKERS: RegExp[] = [
  /\bsupply\s+shortfall\b/i,
  /\bmateriel\s+shortfall\b/i,
  /\blogistics\s+failure\b/i,
  /\brange\s+(?:unavailable|closed)\b/i,
  /\bstock[-\s]?out\b/i,
  /\bparts\s+shortage\b/i,
  /\bcannot\s+sustain\b/i,
  /\bunsupportable\b/i,
  /\bmilcon\s+shortfall\b/i,
];

const FISCAL_MARKERS: RegExp[] = [
  /\bover[-\s]?obligat\w*/i,
  /\banti[-\s]?deficiency\b/i,
  /\bada\s+violation\b/i,
  /\bunfunded\b/i,
  /\bexceeds?\s+(?:the\s+)?appropriation\b/i,
  /\binsufficient\s+funds\b/i,
  /\bshortfall\s+in\s+funding\b/i,
  /\bfunding\s+shortfall\b/i,
  /\b(?:purpose|time|amount)\s+violation\b/i,
];

function blank(v: string | undefined): string {
  return v ?? "";
}

function pool(...parts: (string | undefined)[]): string {
  return parts.map(blank).join("\n");
}

function evaluatePersonnelReadiness(
  constraints: Constraints,
  estimate: RunningEstimate,
): CategoryEvaluation {
  const text = pool(constraints.manpowerBillets, estimate.billetBalance);
  const pct = contextPercentMatch(
    text,
    ["manning", "readiness", "fill", "billet", "staffed", "strength"],
    (p) => p < 80,
  );
  const marker = firstMatch(text, PERSONNEL_CRITICAL_MARKERS);
  const trigger = pct ?? marker;
  return {
    category: "PersonnelReadiness",
    trigger,
    recommendedAction:
      "Notify G-1; convene a manning/readiness review and prioritize fills or a temporary billet realignment to restore mission-capable strength.",
  };
}

function evaluateThreatOvermatch(
  constraints: Constraints,
  estimate: RunningEstimate,
): CategoryEvaluation {
  const text = pool(
    constraints.manpowerBillets,
    constraints.fundingPomCycle,
    constraints.facilitiesRanges,
    estimate.billetBalance,
    estimate.fundingStatus,
  );
  const trigger = firstMatch(text, THREAT_MARKERS);
  return {
    category: "ThreatOvermatch",
    trigger,
    recommendedAction:
      "Alert G-2/Threat Integration; task a capability-gap assessment and accelerate the offsetting Force Design/materiel solution.",
  };
}

function evaluateLogisticsFailure(
  constraints: Constraints,
  estimate: RunningEstimate,
): CategoryEvaluation {
  const text = pool(constraints.facilitiesRanges, estimate.billetBalance);
  const pct = contextPercentMatch(
    text,
    ["supply", "materiel", "material", "range", "availability", "sustainment"],
    (p) => p < 70,
  );
  const marker = firstMatch(text, LOGISTICS_MARKERS);
  const trigger = pct ?? marker;
  return {
    category: "LogisticsFailure",
    trigger,
    recommendedAction:
      "Engage G-4; execute cross-leveling or emergency resupply and identify an alternate facility/range to preserve the schedule.",
  };
}

function evaluateFiscalLaw(
  constraints: Constraints,
  estimate: RunningEstimate,
): CategoryEvaluation {
  const text = pool(constraints.fundingPomCycle, estimate.fundingStatus);
  const pct = contextPercentMatch(
    text,
    ["obligat", "obligation", "executed", "commit"],
    (p) => p > 100,
  );
  const marker = firstMatch(text, FISCAL_MARKERS);
  const trigger = pct ?? marker;
  return {
    category: "FiscalLaw",
    trigger,
    recommendedAction:
      "Immediately notify G-8/Comptroller and SJA; halt further obligation and validate funds availability to prevent an Anti-Deficiency Act violation.",
  };
}

/**
 * Concrete CcirEngine implementation (Rule 13 / Requirements 13.1, 13.2).
 *
 * Evaluates all four categories in a fixed, documented order and emits one
 * alert per category whose threshold is met. The order is deterministic and
 * mirrors the SAGE directive's escalation priority: personnel, threat,
 * logistics, then fiscal law.
 */
export class CcirEngineImpl implements CcirEngine {
  evaluate(input: { constraints: Constraints; estimate: RunningEstimate }): CcirAlert[] {
    const constraints = input.constraints ?? {};
    const estimate =
      input.estimate ??
      ({
        billetBalance: "",
        fundingStatus: "",
        activeCcirAlerts: [],
        revisions: [],
      } as RunningEstimate);

    const evaluations: CategoryEvaluation[] = [
      evaluatePersonnelReadiness(constraints, estimate),
      evaluateThreatOvermatch(constraints, estimate),
      evaluateLogisticsFailure(constraints, estimate),
      evaluateFiscalLaw(constraints, estimate),
    ];

    const alerts: CcirAlert[] = [];
    for (const ev of evaluations) {
      if (ev.trigger !== undefined && ev.trigger.trim().length > 0) {
        alerts.push({
          category: ev.category,
          triggeringCondition: `${ev.category}: threshold met — "${ev.trigger.trim()}".`,
          recommendedAction: ev.recommendedAction,
        });
      }
    }
    return alerts;
  }
}

/** Convenience singleton for callers that don't need their own instance. */
export const ccirEngine: CcirEngine = new CcirEngineImpl();

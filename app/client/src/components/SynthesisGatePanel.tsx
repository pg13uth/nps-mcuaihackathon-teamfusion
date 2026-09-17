/**
 * SynthesisGatePanel (Task 13.3) — Rule 15 / Requirements 11.1, 11.2.
 *
 * Displays the four Synthesis Gate QA checks carried on an
 * {@link OutputArtifact}'s `gate` ({@link SynthesisGateResult}): Legal
 * Clearance, Strategic Uplift, Citation Verification, and Binary Decision
 * Point. Any failing check is highlighted so the user sees the specific failure
 * before finalizing (11.2).
 *
 * Accessibility: when the gate has NOT fully passed the panel is announced via
 * `role="alert"`. Pass/fail state is conveyed with explicit PASS / FAIL text
 * (and an aria-label per item) — never color alone.
 */

import type { SynthesisGateResult, GateItem } from "@sage/shared";
import "./task13-3.css";

/** Ordered display metadata for the four gate items (Rule 15 order). */
const GATE_ITEMS: ReadonlyArray<{ key: keyof SynthesisGateResult; label: string }> = [
  { key: "legalClearance", label: "Legal Clearance" },
  { key: "strategicUplift", label: "Strategic Uplift" },
  { key: "citationVerification", label: "Citation Verification" },
  { key: "binaryDecisionPoint", label: "Binary Decision Point" },
];

export interface SynthesisGatePanelProps {
  /**
   * The gate result to render. When absent (e.g. a non-brief step, or a brief
   * that has not been generated yet) the panel shows an inert empty state.
   */
  gate?: SynthesisGateResult;
}

export function SynthesisGatePanel({ gate }: SynthesisGatePanelProps) {
  if (!gate) {
    return (
      <section aria-labelledby="synthesis-gate-heading" className="sage-t3-panel">
        <h2 id="synthesis-gate-heading">Synthesis Gate</h2>
        <p data-testid="synthesis-gate-empty">
          No Synthesis Gate has run yet. Generate a full brief to see the four QA
          checks.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="synthesis-gate-heading"
      className="sage-t3-panel"
      // Announce failures assertively; passing gates are non-alerting.
      role={gate.passed ? undefined : "alert"}
    >
      <h2 id="synthesis-gate-heading">Synthesis Gate</h2>
      <p data-testid="synthesis-gate-summary">
        <span className={`sage-t3-status-tag ${gate.passed ? "is-pass" : "is-fail"}`}>
          {gate.passed ? "PASSED" : "FAILED"}
        </span>{" "}
        {gate.passed
          ? "All four QA checks passed."
          : "One or more QA checks failed — resolve before finalizing."}
      </p>

      <ul className="sage-t3-gate-list" data-testid="synthesis-gate-list">
        {GATE_ITEMS.map(({ key, label }) => {
          const item = gate[key] as GateItem;
          const stateClass = item.passed ? "is-pass" : "is-fail";
          const stateText = item.passed ? "PASS" : "FAIL";
          return (
            <li
              key={key}
              className={`sage-t3-gate-item ${stateClass}`}
              data-testid={`gate-item-${key}`}
              data-passed={item.passed}
              aria-label={`${label}: ${stateText}`}
            >
              <span className={`sage-t3-status-tag ${stateClass}`}>{stateText}</span>
              <span>
                <span className="sage-t3-label">{label}:</span> {item.detail}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

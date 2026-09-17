/**
 * AssumptionsPanel (Task 13.1) — renders the resolved assumptions returned by
 * `POST /tasks` before generation (Requirement 1.3). Blank baseline constraints
 * are converted by the backend into explicit assumptions; this panel surfaces
 * them so the user sees exactly what was assumed rather than invented.
 */

import type { Assumption } from "@sage/shared";

/** Human-readable labels for the constraint fields an assumption can reference. */
const FIELD_LABELS: Record<Assumption["field"], string> = {
  manpowerBillets: "Manpower / Billets",
  fundingPomCycle: "Funding / POM Cycle",
  facilitiesRanges: "Facilities / Ranges",
};

export interface AssumptionsPanelProps {
  assumptions: Assumption[];
}

export function AssumptionsPanel({ assumptions }: AssumptionsPanelProps) {
  return (
    <section aria-labelledby="assumptions-heading" className="panel">
      <h2 id="assumptions-heading">Resolved Assumptions</h2>
      {assumptions.length === 0 ? (
        <p data-testid="assumptions-empty">
          No assumptions were needed — all baseline constraints were provided.
        </p>
      ) : (
        <ul data-testid="assumptions-list">
          {assumptions.map((assumption) => (
            <li key={assumption.field}>
              <span className="assumption-field">{FIELD_LABELS[assumption.field]}:</span>{" "}
              <span className="assumption-text">{assumption.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

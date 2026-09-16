/**
 * ConstraintResolver (pure orchestration).
 *
 * Rule R1.3 / Requirement 1.3: every blank or undefined baseline constraint is
 * converted into an explicit {@link Assumption} record and surfaced downstream
 * (in the output's Assumptions & Limitations section). A blank field is NEVER
 * populated with a fabricated value — the resolved constraint stays unset so
 * that nothing is invented. Present (non-blank) fields pass through unchanged.
 */

import type { ConstraintResolver, Constraints, Assumption } from "@sage/shared";

/** The baseline constraint fields, in a stable, deterministic order. */
const CONSTRAINT_FIELDS = [
  "manpowerBillets",
  "fundingPomCycle",
  "facilitiesRanges",
] as const satisfies readonly (keyof Constraints)[];

/**
 * Human-readable assumption text produced for each blank constraint field.
 * The text names the gap explicitly; it does not assert a concrete value.
 */
const ASSUMPTION_TEXT: Record<keyof Constraints, string> = {
  manpowerBillets:
    "No manpower/billet data provided; treating billets as an open assumption (current T/O steady-state) rather than an invented figure.",
  fundingPomCycle:
    "No funding/POM cycle data provided; treating funding posture as an open assumption rather than an invented figure.",
  facilitiesRanges:
    "No facilities/ranges data provided; treating facility and range availability as an open assumption rather than an invented figure.",
};

/**
 * A constraint field is considered blank when it is `undefined` or contains
 * only whitespace once trimmed. Present values pass through verbatim (untrimmed)
 * so no user input is silently altered.
 */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export class DefaultConstraintResolver implements ConstraintResolver {
  resolve(constraints: Constraints): {
    resolved: Constraints;
    assumptions: Assumption[];
  } {
    const resolved: Constraints = {};
    const assumptions: Assumption[] = [];

    for (const field of CONSTRAINT_FIELDS) {
      const value = constraints[field];
      if (isBlank(value)) {
        // Blank/undefined: emit an explicit assumption and leave resolved unset.
        // We deliberately do NOT write a value into `resolved[field]`.
        assumptions.push({ field, text: ASSUMPTION_TEXT[field] });
      } else {
        // Present: pass the user-provided value through unchanged.
        resolved[field] = value;
      }
    }

    return { resolved, assumptions };
  }
}

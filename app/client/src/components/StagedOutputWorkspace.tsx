/**
 * StagedOutputWorkspace (Task 13.2) — one section per output step, each with an
 * independent "Regenerate this step" button and its own status.
 *
 * Requirements:
 *  - 15.1 the brief and storyboard (and each report) are separate generation
 *         steps.
 *  - 15.2 an output step can be regenerated without redoing the others.
 *
 * Design mirror (Property 16 — staged regeneration isolates steps): each step
 * owns an INDEPENDENT slice of React state (status, artifact, error). Kicking
 * off `generateStep(taskId, step)` for one step only ever mutates that step's
 * slice, so regenerating one step never disturbs another's rendered output or
 * status. This mirrors the backend guarantee in the UI layer.
 *
 * The component reuses the shared transport (`generateStep`) from api.ts; it
 * does not re-implement any fetch logic.
 */

import { useCallback, useReducer } from "react";
import type { OutputArtifact, OutputStep } from "@sage/shared";
import { generateStep, ApiError, type GenerateStepResponse } from "../api.js";
import "./stagedOutput.css";

/**
 * Per-step UI status.
 *  - pending:    never generated yet.
 *  - generating: a generateStep call is in flight for THIS step.
 *  - complete:   artifact returned with status "complete".
 *  - failed:     the call errored, or the artifact came back status "failed".
 *  - truncated:  the artifact came back status "truncated" (offer regenerate).
 */
export type StepStatus =
  | "pending"
  | "generating"
  | "complete"
  | "failed"
  | "truncated";

/** The ordered list of output steps rendered as sections. */
const STEPS: { step: OutputStep; label: string }[] = [
  { step: "brief", label: "Executive Brief" },
  { step: "storyboard", label: "6-Slide Storyboard" },
  { step: "sitrep", label: "Daily SITREP" },
  { step: "cub", label: "Weekly CUB" },
  { step: "qpr", label: "Quarterly QPR" },
  { step: "order", label: "Order / Tasking" },
  { step: "curriculum", label: "Curriculum" },
];

/** Independent state for a single step. */
interface StepState {
  status: StepStatus;
  artifact: OutputArtifact | null;
  error: string | null;
}

/** The workspace state: one independent slice per step. */
type WorkspaceState = Record<OutputStep, StepState>;

const INITIAL_STEP_STATE: StepState = {
  status: "pending",
  artifact: null,
  error: null,
};

function initialState(): WorkspaceState {
  return STEPS.reduce((acc, { step }) => {
    acc[step] = { ...INITIAL_STEP_STATE };
    return acc;
  }, {} as WorkspaceState);
}

type Action =
  | { type: "start"; step: OutputStep }
  | { type: "success"; step: OutputStep; artifact: OutputArtifact }
  | { type: "error"; step: OutputStep; error: string };

/**
 * Reducer that only ever replaces the slice for `action.step`, leaving every
 * other step's slice referentially unchanged (Property 16 in the UI).
 */
function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        [action.step]: { status: "generating", artifact: null, error: null },
      };
    case "success": {
      const status: StepStatus =
        action.artifact.status === "complete"
          ? "complete"
          : action.artifact.status === "truncated"
            ? "truncated"
            : "failed";
      return {
        ...state,
        [action.step]: { status, artifact: action.artifact, error: null },
      };
    }
    case "error":
      return {
        ...state,
        [action.step]: { status: "failed", artifact: null, error: action.error },
      };
    default:
      return state;
  }
}

/** Human-readable status labels for the per-step status region. */
const STATUS_LABELS: Record<StepStatus, string> = {
  pending: "Pending",
  generating: "Generating…",
  complete: "Complete",
  failed: "Failed",
  truncated: "Truncated",
};

export interface StagedOutputWorkspaceProps {
  /** The active task id; used to address `generateStep(taskId, step)`. */
  taskId: string;
  /**
   * Optional hook invoked after any step generates successfully, so parent
   * panels (e.g. CCIR banner, running estimate) can react without this
   * component owning that cross-panel state.
   */
  onStepGenerated?: (step: OutputStep, result: GenerateStepResponse) => void;
}

export function StagedOutputWorkspace({
  taskId,
  onStepGenerated,
}: StagedOutputWorkspaceProps) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const runStep = useCallback(
    async (step: OutputStep) => {
      dispatch({ type: "start", step });
      try {
        const result = await generateStep(taskId, step);
        dispatch({ type: "success", step, artifact: result.artifact });
        onStepGenerated?.(step, result);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Generation failed. Please try again.";
        dispatch({ type: "error", step, error: message });
      }
    },
    [taskId, onStepGenerated],
  );

  return (
    <section
      aria-labelledby="staged-output-heading"
      className="panel staged-output"
      data-testid="staged-output"
    >
      <h2 id="staged-output-heading">Staged Output Workspace</h2>
      <p className="hint">
        Each output is generated independently. Regenerating one step never
        affects the others.
      </p>

      {STEPS.map(({ step, label }) => {
        const slice = state[step];
        const busy = slice.status === "generating";
        const hasRun = slice.status !== "pending";
        const buttonLabel = hasRun
          ? `Regenerate ${label}`
          : `Generate ${label}`;

        return (
          <article
            key={step}
            className="staged-step"
            data-testid={`staged-step-${step}`}
            data-status={slice.status}
          >
            <div className="staged-step-header">
              <h3>{label}</h3>
              <button
                type="button"
                onClick={() => void runStep(step)}
                disabled={busy}
                aria-label={buttonLabel}
                data-testid={`regenerate-${step}`}
              >
                {busy ? "Generating…" : hasRun ? "Regenerate this step" : "Generate this step"}
              </button>
            </div>

            {/* Perceivable status region: announced to assistive tech on change. */}
            <p
              className={`staged-step-status status-${slice.status}`}
              role="status"
              aria-live="polite"
              data-testid={`status-${step}`}
            >
              <span className="visually-hidden">{label} status: </span>
              {STATUS_LABELS[slice.status]}
            </p>

            {slice.error ? (
              <p
                role="alert"
                className="error"
                data-testid={`error-${step}`}
              >
                {slice.error}
              </p>
            ) : null}

            {slice.artifact && slice.status !== "generating" ? (
              <>
                <pre
                  className="staged-step-body"
                  data-testid={`body-${step}`}
                >
                  {slice.artifact.body}
                </pre>

                {/* Validation result (Rules 6-10): pass/fail + any violations.
                    Conveyed as text, not colour alone, for accessibility. */}
                <div
                  className={`staged-step-validation ${
                    slice.artifact.validation.valid
                      ? "validation-valid"
                      : "validation-invalid"
                  }`}
                  data-testid={`validation-${step}`}
                >
                  <p className="staged-step-validation-summary">
                    Validation:{" "}
                    {slice.artifact.validation.valid ? "Passed" : "Failed"}
                  </p>
                  {slice.artifact.validation.violations.length > 0 ? (
                    <ul data-testid={`violations-${step}`}>
                      {slice.artifact.validation.violations.map(
                        (violation, i) => (
                          <li key={i}>{violation}</li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              </>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

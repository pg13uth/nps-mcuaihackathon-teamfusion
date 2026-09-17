/**
 * TaskIntakeForm (Task 13.1) — captures a specific requirement plus baseline
 * constraints, the Core Operational Process, and an Operational Mode.
 *
 * Requirements:
 *  - 1.1 free-text requirement field (the [INSERT SPECIFIC REQUIREMENT HERE]).
 *  - 1.2 structured constraint fields: Manpower/billets, Funding/POM cycle,
 *        Facilities/ranges.
 *  - 1.4 Core Operational Process selector (drives SME routing).
 *  - 2.1 Operational Mode selector (Lite / Standard / Full Staff / Crisis Action).
 *  - 2.2 leaving the mode unset ("Recommend") lets the backend recommend a mode.
 *
 * The form performs the `createTask` call itself and hands the result up via
 * `onTaskCreated`, so the App shell stays thin and siblings can reuse the same
 * flow. Blank constraints are intentionally sent as omitted fields so the
 * backend converts them into explicit assumptions (Requirement 1.3).
 */

import { useState, type FormEvent } from "react";
import type { Constraints, CoreProcess, OperationalMode, Tier } from "@sage/shared";
import { createTask, ApiError, type CreateTaskResponse } from "../api.js";

/** The mode selector's special "let the backend recommend" sentinel. */
const RECOMMEND = "__recommend__";

/** Core Operational Process options (Requirement 1.4 / Rule 12). */
const PROCESS_OPTIONS: { value: CoreProcess; label: string }[] = [
  { value: "ProgramObjectiveMemorandum", label: "Program Objective Memorandum (POM)" },
  { value: "CampaignPlanning", label: "Campaign Planning" },
  { value: "CurriculumDevelopment", label: "Curriculum Development" },
  { value: "CapabilityAssessment", label: "Capability Assessment" },
  { value: "CrisisResponse", label: "Crisis Response" },
  { value: "PolicyDevelopment", label: "Policy Development" },
];

/** Tier options — drives SME tier filtering and echelon compartmentalization. */
const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "Strategic", label: "Strategic" },
  { value: "Operational", label: "Operational" },
  { value: "Tactical", label: "Tactical" },
];

/** Operational Mode options (Requirement 2.1 / Rule 16). */
const MODE_OPTIONS: { value: OperationalMode; label: string }[] = [
  { value: "Lite", label: "Lite" },
  { value: "Standard", label: "Standard" },
  { value: "FullStaff", label: "Full Staff" },
  { value: "CrisisAction", label: "Crisis Action" },
];

export interface TaskIntakeFormProps {
  /** Called with the backend response after a task is successfully created. */
  onTaskCreated: (result: CreateTaskResponse) => void;
}

export function TaskIntakeForm({ onTaskCreated }: TaskIntakeFormProps) {
  const [requirementText, setRequirementText] = useState("");
  const [process, setProcess] = useState<CoreProcess>("CampaignPlanning");
  const [tier, setTier] = useState<Tier>("Strategic");
  // Default to "Recommend" so leaving the mode unset asks the backend (2.2).
  const [mode, setMode] = useState<OperationalMode | typeof RECOMMEND>(RECOMMEND);
  const [manpowerBillets, setManpowerBillets] = useState("");
  const [fundingPomCycle, setFundingPomCycle] = useState("");
  const [facilitiesRanges, setFacilitiesRanges] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Build constraints, omitting blanks so the backend records assumptions
    // rather than receiving empty strings (Requirement 1.3).
    const constraints: Constraints = {};
    if (manpowerBillets.trim() !== "") constraints.manpowerBillets = manpowerBillets.trim();
    if (fundingPomCycle.trim() !== "") constraints.fundingPomCycle = fundingPomCycle.trim();
    if (facilitiesRanges.trim() !== "") constraints.facilitiesRanges = facilitiesRanges.trim();

    setSubmitting(true);
    try {
      const result = await createTask({
        requirementText: requirementText.trim(),
        process,
        tier,
        // Omit mode entirely when "Recommend" is selected (Requirement 2.2).
        ...(mode === RECOMMEND ? {} : { mode }),
        constraints,
      });
      onTaskCreated(result);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong creating the task. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="intake-heading" className="panel">
      <h2 id="intake-heading">New Task Intake</h2>
      <form onSubmit={handleSubmit} noValidate>
        {/* Requirement 1.1: free-text requirement */}
        <div className="field">
          <label htmlFor="requirementText">Specific Requirement</label>
          <textarea
            id="requirementText"
            name="requirementText"
            rows={4}
            value={requirementText}
            placeholder="Describe the specific requirement…"
            onChange={(e) => setRequirementText(e.target.value)}
          />
        </div>

        {/* Requirement 1.4: Core Operational Process */}
        <div className="field">
          <label htmlFor="process">Core Operational Process</label>
          <select
            id="process"
            name="process"
            value={process}
            onChange={(e) => setProcess(e.target.value as CoreProcess)}
          >
            {PROCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tier */}
        <div className="field">
          <label htmlFor="tier">Tier</label>
          <select
            id="tier"
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
          >
            {TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Requirement 2.1 / 2.2: Operational Mode with "Recommend" affordance */}
        <div className="field">
          <label htmlFor="mode">Operational Mode</label>
          <select
            id="mode"
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as OperationalMode | typeof RECOMMEND)}
          >
            <option value={RECOMMEND}>Recommend for me</option>
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="hint" id="mode-hint">
            Leave on “Recommend for me” to let SAGE choose the mode from your
            requirement and process.
          </p>
        </div>

        {/* Requirement 1.2: structured baseline constraints */}
        <fieldset className="field">
          <legend>Baseline Constraints</legend>
          <p className="hint">
            Leave any field blank to have it recorded as an explicit assumption
            instead of an invented value.
          </p>

          <div className="field">
            <label htmlFor="manpowerBillets">Manpower / Billets</label>
            <input
              id="manpowerBillets"
              name="manpowerBillets"
              type="text"
              value={manpowerBillets}
              placeholder="e.g. current T/O steady-state"
              onChange={(e) => setManpowerBillets(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="fundingPomCycle">Funding / POM Cycle</label>
            <input
              id="fundingPomCycle"
              name="fundingPomCycle"
              type="text"
              value={fundingPomCycle}
              placeholder="e.g. FY26 POM, unfunded"
              onChange={(e) => setFundingPomCycle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="facilitiesRanges">Facilities / Ranges</label>
            <input
              id="facilitiesRanges"
              name="facilitiesRanges"
              type="text"
              value={facilitiesRanges}
              placeholder="e.g. Range Alpha availability"
              onChange={(e) => setFacilitiesRanges(e.target.value)}
            />
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="error" data-testid="intake-error">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create Task"}
        </button>
      </form>
    </section>
  );
}

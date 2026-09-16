/**
 * App shell (Task 13.1 foundation).
 *
 * Holds the current task in top-level state and renders the two components
 * built in this task — {@link TaskIntakeForm} and {@link AssumptionsPanel} —
 * plus clearly-marked placeholder mount points for the sibling tasks:
 *
 *   - 13.2: RoutingBlockView + StagedOutputWorkspace
 *   - 13.3: SynthesisGatePanel, CcirAlertBanner, RunningEstimateView,
 *           DocumentLibraryView, AiConfigHealth
 *
 * State contract for siblings
 * ---------------------------
 * The current task result (from `POST /tasks`) lives here in a single
 * `useState`. `currentTask` is the full {@link CreateTaskResponse} (task +
 * routingPreview + resolvedAssumptions), or `null` before intake. Siblings can:
 *   - read `currentTask.task.id` to call `generateStep(...)`,
 *   - read `currentTask.routingPreview` for RoutingBlockView (13.2),
 *   - render inside the placeholder regions below without changing this file's
 *     data flow (replace the placeholder JSX with the real component).
 *
 * If richer cross-panel state is needed later (e.g. generated artifacts,
 * estimate), promote this `useState` to a small context provider; the mount
 * points and the `onTaskCreated` handoff stay the same.
 */

import { useState } from "react";
import { TaskIntakeForm } from "./components/TaskIntakeForm.js";
import { AssumptionsPanel } from "./components/AssumptionsPanel.js";
import { RoutingBlockView } from "./components/RoutingBlockView.js";
import { StagedOutputWorkspace } from "./components/StagedOutputWorkspace.js";
import { SynthesisGatePanel } from "./components/SynthesisGatePanel.js";
import { CcirAlertBanner } from "./components/CcirAlertBanner.js";
import { RunningEstimateView } from "./components/RunningEstimateView.js";
import { DocumentLibraryView } from "./components/DocumentLibraryView.js";
import { AiConfigHealth } from "./components/AiConfigHealth.js";
import type { CreateTaskResponse } from "./api.js";
import type { CcirAlert, SynthesisGateResult } from "@sage/shared";
import "./styles.css";

export function App() {
  // The single source of truth for the active task. Siblings read from here.
  const [currentTask, setCurrentTask] = useState<CreateTaskResponse | null>(null);

  // Task 13.3-owned state: the QA gate + CCIR alerts from the most recent
  // generate response. Kept inert (undefined) by default so nothing here
  // changes 13.1's `currentTask` contract or 13.2's StagedOutputWorkspace. If a
  // future wiring surfaces the latest GenerateStepResponse, set this to
  // { gate: artifact.gate, ccirAlerts } to light up the panels.
  const [qaGate] = useState<{
    gate?: SynthesisGateResult;
    ccirAlerts?: CcirAlert[];
  }>({});

  return (
    <div>
      <header className="app-header">
        <h1>SAGE Briefing Application</h1>
      </header>

      <div className="app-layout">
        {/* Left column: intake + resolved assumptions (this task, 13.1). */}
        <div>
          <TaskIntakeForm onTaskCreated={setCurrentTask} />
          {currentTask ? (
            <AssumptionsPanel assumptions={currentTask.resolvedAssumptions} />
          ) : null}
        </div>

        {/* Right column: staged output + supporting panels (siblings). */}
        <div>
          {currentTask ? (
            <>
              {/* MOUNT POINT (Task 13.2): RoutingBlockView. */}
              <div data-testid="mount-routing-block">
                <RoutingBlockView routing={currentTask.routingPreview} />
              </div>

              {/* MOUNT POINT (Task 13.2): StagedOutputWorkspace. */}
              <div data-testid="mount-staged-output">
                <StagedOutputWorkspace taskId={currentTask.task.id} />
              </div>

              {/* MOUNT POINT (Task 13.3): CcirAlertBanner + SynthesisGatePanel.
                  Both are prop-driven from a generate response (artifact.gate /
                  ccirAlerts). To keep 13.1's `currentTask` contract and 13.2's
                  StagedOutputWorkspace untouched, these render inert by default:
                  the banner renders nothing without alerts and the gate shows
                  its empty state until a full brief is generated. Active CCIRs
                  are also always visible via the RunningEstimateView below. */}
              <section data-testid="mount-qa-alerts">
                <CcirAlertBanner alerts={qaGate.ccirAlerts} />
                <SynthesisGatePanel gate={qaGate.gate} />
              </section>
            </>
          ) : (
            <section className="placeholder">
              <h2>No active task</h2>
              <p>Create a task on the left to begin staged generation.</p>
            </section>
          )}

          {/* MOUNT POINT (Task 13.3): RunningEstimateView, DocumentLibraryView,
              AiConfigHealth — task-independent panels that self-fetch on mount. */}
          <section data-testid="mount-support-panels">
            <RunningEstimateView />
            <DocumentLibraryView />
            <AiConfigHealth />
          </section>
        </div>
      </div>
    </div>
  );
}

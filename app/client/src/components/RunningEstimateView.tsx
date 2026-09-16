/**
 * RunningEstimateView (Task 13.3) — Rule 17 / Requirements 12.1, 12.2, 12.3.
 *
 * Fetches the running estimate via `getEstimate()` and renders:
 *   - Billet Balance and Funding Status (12.1),
 *   - Active CCIR Alerts (reusing {@link CcirAlertBanner}) (12.1),
 *   - detected resource collisions (12.2),
 *   - the full revision history (12.3).
 *
 * The component self-loads on mount and exposes a manual "Refresh" affordance so
 * siblings can trigger a reload after a generate step without prop wiring. A
 * `refreshSignal` prop (any changing value) also forces a reload, letting the
 * parent App request a refresh after generation.
 */

import { useCallback, useEffect, useState } from "react";
import type { EstimateResponse } from "../api.js";
import { getEstimate, ApiError } from "../api.js";
import { CcirAlertBanner } from "./CcirAlertBanner.js";
import "./task13-3.css";

export interface RunningEstimateViewProps {
  /**
   * Optional changing value that forces a reload when it changes (e.g. bump
   * after a successful generate step so the estimate reflects the new outcome).
   */
  refreshSignal?: unknown;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; data: EstimateResponse };

export function RunningEstimateView({ refreshSignal }: RunningEstimateViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await getEstimate();
      setState({ kind: "loaded", data });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to load the running estimate.";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <section aria-labelledby="running-estimate-heading" className="sage-t3-panel">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <h2 id="running-estimate-heading">Running Estimate</h2>
        <button type="button" onClick={() => void load()} data-testid="estimate-refresh">
          Refresh
        </button>
      </div>

      {state.kind === "loading" ? (
        <p data-testid="estimate-loading">Loading running estimate…</p>
      ) : null}

      {state.kind === "error" ? (
        <p className="sage-t3-error" role="alert" data-testid="estimate-error">
          {state.message}
        </p>
      ) : null}

      {state.kind === "loaded" ? (
        <RunningEstimateContent data={state.data} />
      ) : null}
    </section>
  );
}

function RunningEstimateContent({ data }: { data: EstimateResponse }) {
  const { estimate, revisions, collisions } = data;
  return (
    <div data-testid="estimate-content">
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
        <dt className="sage-t3-label">Billet Balance</dt>
        <dd style={{ margin: 0 }} data-testid="estimate-billet">
          {estimate.billetBalance || "—"}
        </dd>
        <dt className="sage-t3-label">Funding Status</dt>
        <dd style={{ margin: 0 }} data-testid="estimate-funding">
          {estimate.fundingStatus || "—"}
        </dd>
      </dl>

      <h3>Active CCIR Alerts</h3>
      {estimate.activeCcirAlerts.length === 0 ? (
        <p data-testid="estimate-no-ccir">No active CCIR alerts.</p>
      ) : (
        <CcirAlertBanner alerts={estimate.activeCcirAlerts} />
      )}

      <h3>Resource Collisions</h3>
      {collisions.length === 0 ? (
        <p data-testid="estimate-no-collisions">No resource collisions detected.</p>
      ) : (
        <ul data-testid="estimate-collisions">
          {collisions.map((collision, index) => (
            <li key={`${collision.resource}-${index}`}>
              <span className="sage-t3-label">{collision.resource}:</span>{" "}
              {collision.detail}
              {collision.conflictingTaskIds.length > 0 ? (
                <span>
                  {" "}
                  (tasks: {collision.conflictingTaskIds.join(", ")})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h3>Revision History</h3>
      {revisions.length === 0 ? (
        <p data-testid="estimate-no-revisions">No revisions recorded yet.</p>
      ) : (
        <ol data-testid="estimate-revisions">
          {revisions.map((revision, index) => (
            <li key={`${revision.at}-${index}`}>
              <span className="sage-t3-label">{revision.at}</span> — {revision.summary}
              <br />
              <small>
                Billets: {revision.billetBalance || "—"} · Funding:{" "}
                {revision.fundingStatus || "—"} · Task: {revision.taskId}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

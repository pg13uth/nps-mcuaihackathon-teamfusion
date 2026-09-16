/**
 * AiConfigHealth (Task 13.3) — Rule 14 / Requirement 14.3.
 *
 * Fetches service + AI endpoint health via `getHealth()` and surfaces whether
 * the AI endpoint is configured and reachable, plus a clear error state when
 * the endpoint is unreachable so the user knows generation will fail and their
 * inputs are preserved (14.3).
 *
 * Accessibility: an unhealthy state (not configured, or configured but not
 * reachable) is announced via `role="alert"`. Status is conveyed with explicit
 * text ("Reachable" / "Unreachable" / "Not configured"), not color alone.
 */

import { useCallback, useEffect, useState } from "react";
import type { HealthResponse } from "../api.js";
import { getHealth, ApiError } from "../api.js";
import "./task13-3.css";

export interface AiConfigHealthProps {
  /** Optional changing value that forces a health re-check. */
  refreshSignal?: unknown;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; data: HealthResponse };

export function AiConfigHealth({ refreshSignal }: AiConfigHealthProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await getHealth();
      setState({ kind: "loaded", data });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to reach the backend.";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <section aria-labelledby="ai-health-heading" className="sage-t3-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="ai-health-heading">AI Endpoint Health</h2>
        <button type="button" onClick={() => void load()} data-testid="health-refresh">
          Re-check
        </button>
      </div>

      {state.kind === "loading" ? (
        <p data-testid="health-loading">Checking AI endpoint…</p>
      ) : null}

      {state.kind === "error" ? (
        <p className="sage-t3-error" role="alert" data-testid="health-backend-error">
          {state.message}
        </p>
      ) : null}

      {state.kind === "loaded" ? <HealthContent data={state.data} /> : null}
    </section>
  );
}

function HealthContent({ data }: { data: HealthResponse }) {
  const { ai } = data;
  const configured = ai.configured;
  // reachable is optional: only meaningful when configured.
  const reachable = ai.reachable;

  // Determine overall health for the alert role + status word.
  let dotClass: string;
  let statusWord: string;
  let healthy: boolean;

  if (!configured) {
    dotClass = "is-bad";
    statusWord = "Not configured";
    healthy = false;
  } else if (reachable === false) {
    dotClass = "is-bad";
    statusWord = "Unreachable";
    healthy = false;
  } else if (reachable === true) {
    dotClass = "is-ok";
    statusWord = "Reachable";
    healthy = true;
  } else {
    // Configured but reachability unknown (not probed).
    dotClass = "is-unknown";
    statusWord = "Configured (reachability unknown)";
    healthy = true;
  }

  return (
    <div
      data-testid="health-content"
      role={healthy ? undefined : "alert"}
    >
      <p data-testid="health-status">
        <span className={`sage-t3-health-dot ${dotClass}`} aria-hidden="true" />
        <span className="sage-t3-label">AI endpoint:</span> {statusWord}
      </p>
      <p>
        <span className="sage-t3-label">Configured:</span>{" "}
        {configured ? "Yes" : "No"}
      </p>
      {configured ? (
        <p>
          <span className="sage-t3-label">Reachable:</span>{" "}
          {reachable === true ? "Yes" : reachable === false ? "No" : "Unknown"}
        </p>
      ) : null}
      <p data-testid="health-detail">
        <span className="sage-t3-label">Detail:</span> {ai.detail}
      </p>
      {!healthy ? (
        <p data-testid="health-warning">
          Generation will fail until the AI endpoint is reachable. Your inputs are
          preserved — resolve the endpoint configuration and retry.
        </p>
      ) : null}
    </div>
  );
}

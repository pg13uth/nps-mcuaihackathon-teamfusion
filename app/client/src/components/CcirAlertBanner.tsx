/**
 * CcirAlertBanner (Task 13.3) — Rule 13 / Requirements 13.1, 13.2.
 *
 * Renders a prominent banner for fired CCIR alerts. Each alert shows its
 * category, the triggering condition, and the recommended immediate action
 * (13.2). Alerts typically come from a generate response (`ccirAlerts`) or the
 * running estimate's `activeCcirAlerts`.
 *
 * Accessibility: the banner uses `role="alert"` so assistive tech announces
 * newly-fired CCIRs. Severity is conveyed with the word "ALERT" and explicit
 * labels, not color alone. When no alerts are present the component renders
 * nothing (no empty banner clutter).
 */

import type { CcirAlert, CcirCategory } from "@sage/shared";
import "./task13-3.css";

/** Human-readable labels for CCIR categories. */
const CATEGORY_LABELS: Record<CcirCategory, string> = {
  PersonnelReadiness: "Personnel Readiness",
  ThreatOvermatch: "Threat Overmatch",
  LogisticsFailure: "Logistics Failure",
  FiscalLaw: "Fiscal Law",
};

export interface CcirAlertBannerProps {
  /** The fired CCIR alerts to display. Empty/undefined renders nothing. */
  alerts?: CcirAlert[];
}

export function CcirAlertBanner({ alerts }: CcirAlertBannerProps) {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <section
      className="sage-t3-ccir-banner"
      role="alert"
      aria-labelledby="ccir-banner-heading"
      data-testid="ccir-banner"
    >
      <h2 id="ccir-banner-heading" className="sage-t3-ccir-title">
        <span className="sage-t3-status-tag is-fail">CCIR ALERT</span>
        {alerts.length === 1
          ? "1 Commander's Critical Information Requirement fired"
          : `${alerts.length} Commander's Critical Information Requirements fired`}
      </h2>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {alerts.map((alert, index) => (
          <li
            key={`${alert.category}-${index}`}
            className="sage-t3-ccir-alert"
            data-testid={`ccir-alert-${alert.category}`}
          >
            <p style={{ margin: "0 0 4px" }}>
              <span className="sage-t3-ccir-category">
                {CATEGORY_LABELS[alert.category] ?? alert.category}
              </span>
            </p>
            <p style={{ margin: "0 0 4px" }}>
              <span className="sage-t3-label">Triggering condition:</span>{" "}
              {alert.triggeringCondition}
            </p>
            <p style={{ margin: 0 }}>
              <span className="sage-t3-label">Recommended action:</span>{" "}
              {alert.recommendedAction}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

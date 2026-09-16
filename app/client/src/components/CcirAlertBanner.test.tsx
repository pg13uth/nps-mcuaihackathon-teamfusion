/**
 * Component tests for CcirAlertBanner (Task 13.3, Requirements 13.1, 13.2).
 *
 * Verifies a fired alert renders its triggering condition and recommended
 * action inside an announced (role="alert") banner, and that an empty list
 * renders nothing.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CcirAlert } from "@sage/shared";
import { CcirAlertBanner } from "./CcirAlertBanner.js";

describe("CcirAlertBanner", () => {
  it("renders a fired alert's condition and recommended action", () => {
    const alerts: CcirAlert[] = [
      {
        category: "FiscalLaw",
        triggeringCondition: "Obligation exceeds current POM authority by 12%.",
        recommendedAction: "Notify Comptroller and pause obligation immediately.",
      },
    ];
    render(<CcirAlertBanner alerts={alerts} />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("data-testid", "ccir-banner");
    expect(banner).toHaveTextContent(/Fiscal Law/);
    expect(banner).toHaveTextContent(/Obligation exceeds current POM authority by 12%/);
    expect(banner).toHaveTextContent(/Notify Comptroller and pause obligation immediately/);
  });

  it("renders each of multiple fired alerts", () => {
    const alerts: CcirAlert[] = [
      {
        category: "PersonnelReadiness",
        triggeringCondition: "Manning below 80%.",
        recommendedAction: "Request augmentation.",
      },
      {
        category: "LogisticsFailure",
        triggeringCondition: "Range Alpha unavailable.",
        recommendedAction: "Reschedule to Range Bravo.",
      },
    ];
    render(<CcirAlertBanner alerts={alerts} />);
    expect(screen.getByTestId("ccir-alert-PersonnelReadiness")).toBeInTheDocument();
    expect(screen.getByTestId("ccir-alert-LogisticsFailure")).toBeInTheDocument();
  });

  it("renders nothing when there are no alerts", () => {
    const { container } = render(<CcirAlertBanner alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * Component tests for SynthesisGatePanel (Task 13.3, Requirements 11.1, 11.2).
 *
 * Verifies the four checks render and a failing check is highlighted with
 * explicit FAIL text (not color alone) and announced via role="alert".
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { SynthesisGateResult } from "@sage/shared";
import { SynthesisGatePanel } from "./SynthesisGatePanel.js";

function makeGate(overrides: Partial<SynthesisGateResult> = {}): SynthesisGateResult {
  const base: SynthesisGateResult = {
    legalClearance: { passed: true, detail: "No legal conflicts detected." },
    strategicUplift: { passed: true, detail: "Enterprise-level impact present." },
    citationVerification: { passed: true, detail: "All citations grounded." },
    binaryDecisionPoint: { passed: true, detail: "Clear binary decision offered." },
    passed: true,
  };
  return { ...base, ...overrides };
}

describe("SynthesisGatePanel", () => {
  it("renders all four QA checks", () => {
    render(<SynthesisGatePanel gate={makeGate()} />);
    expect(screen.getByText(/Legal Clearance:/)).toBeInTheDocument();
    expect(screen.getByText(/Strategic Uplift:/)).toBeInTheDocument();
    expect(screen.getByText(/Citation Verification:/)).toBeInTheDocument();
    expect(screen.getByText(/Binary Decision Point:/)).toBeInTheDocument();
  });

  it("highlights a failing check with explicit FAIL text and alerts", () => {
    const gate = makeGate({
      citationVerification: {
        passed: false,
        detail: "Citation [DOC_9] cannot be grounded in an Active document.",
      },
      passed: false,
    });
    render(<SynthesisGatePanel gate={gate} />);

    // Whole panel is announced because the gate did not pass.
    const alert = screen.getByRole("alert");
    expect(within(alert).getByTestId("synthesis-gate-summary")).toHaveTextContent(
      /FAILED/,
    );

    // The failing item carries explicit FAIL text and a data flag (not color alone).
    const failingItem = screen.getByTestId("gate-item-citationVerification");
    expect(failingItem).toHaveAttribute("data-passed", "false");
    expect(within(failingItem).getByText("FAIL")).toBeInTheDocument();
    expect(failingItem).toHaveTextContent(/cannot be grounded/);

    // A passing item still reads PASS.
    const passingItem = screen.getByTestId("gate-item-legalClearance");
    expect(passingItem).toHaveAttribute("data-passed", "true");
    expect(within(passingItem).getByText("PASS")).toBeInTheDocument();
  });

  it("shows an empty state when no gate is provided", () => {
    render(<SynthesisGatePanel />);
    expect(screen.getByTestId("synthesis-gate-empty")).toBeInTheDocument();
  });
});

/**
 * Component tests for RoutingBlockView (Task 13.2).
 *
 * Verifies the five Rule 14 fields render (PROCESS / TIER / SMEs TO TASK /
 * MODE / SEQUENCE) from a supplied routing block.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RoutingBlock } from "@sage/shared";
import { RoutingBlockView } from "./RoutingBlockView.js";

const ROUTING: RoutingBlock = {
  process: "CampaignPlanning",
  tier: "Strategic",
  smesToTask: [1, 2, 17],
  mode: "FullStaff",
  sequence: { kind: "sequential", order: [1, 2, 17] },
};

describe("RoutingBlockView", () => {
  it("renders all five routing block fields", () => {
    render(<RoutingBlockView routing={ROUTING} />);

    expect(screen.getByTestId("routing-process")).toHaveTextContent(
      "Campaign Planning",
    );
    expect(screen.getByTestId("routing-tier")).toHaveTextContent("Strategic");
    expect(screen.getByTestId("routing-smes")).toHaveTextContent("1, 2, 17");
    expect(screen.getByTestId("routing-mode")).toHaveTextContent("Full Staff");
    expect(screen.getByTestId("routing-sequence")).toHaveTextContent(
      "Sequential",
    );
  });

  it("renders the sequence execution order when present", () => {
    render(<RoutingBlockView routing={ROUTING} />);
    // Uses an arrow-joined order display.
    expect(screen.getByTestId("routing-sequence")).toHaveTextContent(
      "1 \u2192 2 \u2192 17",
    );
  });

  it("shows 'None' when no SMEs are tasked", () => {
    render(
      <RoutingBlockView
        routing={{ ...ROUTING, smesToTask: [], sequence: { kind: "parallel", order: [] } }}
      />,
    );
    expect(screen.getByTestId("routing-smes")).toHaveTextContent("None");
  });
});

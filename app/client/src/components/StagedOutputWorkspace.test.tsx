/**
 * Component tests for StagedOutputWorkspace (Task 13.2).
 *
 * Focus:
 *  1. A step transitions generating -> complete and renders its body.
 *  2. A failed step shows "Failed" and leaves OTHER steps untouched
 *     (per-step isolation — Property 16 mirrored in the UI).
 *
 * `generateStep` is mocked so tests never hit the network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OutputArtifact, OutputStep, RoutingBlock } from "@sage/shared";
import type { GenerateStepResponse } from "../api.js";

vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return {
    ...actual,
    generateStep: vi.fn(),
  };
});

import { generateStep } from "../api.js";
import { StagedOutputWorkspace } from "./StagedOutputWorkspace.js";

const mockedGenerateStep = vi.mocked(generateStep);

const ROUTING: RoutingBlock = {
  process: "CampaignPlanning",
  tier: "Strategic",
  smesToTask: [1, 2],
  mode: "FullStaff",
  sequence: { kind: "parallel", order: [1, 2] },
};

/** Build a canned artifact for a step. */
function makeArtifact(
  step: OutputStep,
  status: OutputArtifact["status"] = "complete",
  body = `Generated ${step} body`,
): OutputArtifact {
  return {
    taskId: "task-1",
    step,
    routingBlock: ROUTING,
    body,
    citations: [],
    ungroundable: [],
    flaggedSources: [],
    validation: { valid: true, violations: [] },
    status,
    generatedAt: "2025-01-01T00:00:00.000Z",
  };
}

/** Build a full GenerateStepResponse wrapping an artifact. */
function makeResponse(artifact: OutputArtifact): GenerateStepResponse {
  return {
    artifact,
    ccirAlerts: [],
    collisions: [],
    estimate: {
      billetBalance: "",
      fundingStatus: "",
      activeCcirAlerts: [],
      revisions: [],
    },
  };
}

describe("StagedOutputWorkspace", () => {
  beforeEach(() => {
    mockedGenerateStep.mockReset();
  });

  it("shows generating then complete and renders the body for a step", async () => {
    // A controllable promise so we can observe the "generating" state.
    let resolveCall: (value: GenerateStepResponse) => void = () => {};
    const pending = new Promise<GenerateStepResponse>((resolve) => {
      resolveCall = resolve;
    });
    mockedGenerateStep.mockReturnValue(pending);

    const user = userEvent.setup();
    render(<StagedOutputWorkspace taskId="task-1" />);

    // Initially pending.
    expect(screen.getByTestId("status-brief")).toHaveTextContent("Pending");

    await user.click(screen.getByTestId("regenerate-brief"));

    // While the promise is unresolved, the step is generating.
    await waitFor(() => {
      expect(screen.getByTestId("status-brief")).toHaveTextContent("Generating");
    });

    // Resolve the call and expect the completed state + body.
    resolveCall(makeResponse(makeArtifact("brief", "complete", "BLUF: ...")));

    await waitFor(() => {
      expect(screen.getByTestId("status-brief")).toHaveTextContent("Complete");
    });
    expect(screen.getByTestId("body-brief")).toHaveTextContent("BLUF: ...");
    expect(mockedGenerateStep).toHaveBeenCalledWith("task-1", "brief");
  });

  it("marks a truncated artifact as Truncated", async () => {
    mockedGenerateStep.mockResolvedValue(
      makeResponse(makeArtifact("storyboard", "truncated")),
    );

    const user = userEvent.setup();
    render(<StagedOutputWorkspace taskId="task-1" />);

    await user.click(screen.getByTestId("regenerate-storyboard"));

    await waitFor(() => {
      expect(screen.getByTestId("status-storyboard")).toHaveTextContent(
        "Truncated",
      );
    });
  });

  it("shows Failed for a failed step and leaves other steps untouched", async () => {
    const user = userEvent.setup();
    render(<StagedOutputWorkspace taskId="task-1" />);

    // First: successfully generate the brief.
    mockedGenerateStep.mockResolvedValueOnce(
      makeResponse(makeArtifact("brief", "complete", "Brief stays put")),
    );
    await user.click(screen.getByTestId("regenerate-brief"));
    await waitFor(() => {
      expect(screen.getByTestId("status-brief")).toHaveTextContent("Complete");
    });

    // Then: the storyboard generation fails.
    mockedGenerateStep.mockRejectedValueOnce(new Error("AI endpoint unreachable"));
    await user.click(screen.getByTestId("regenerate-storyboard"));

    await waitFor(() => {
      expect(screen.getByTestId("status-storyboard")).toHaveTextContent("Failed");
    });
    expect(screen.getByTestId("error-storyboard")).toBeInTheDocument();

    // Per-step isolation: the brief slice is unchanged by the storyboard failure.
    expect(screen.getByTestId("status-brief")).toHaveTextContent("Complete");
    expect(screen.getByTestId("body-brief")).toHaveTextContent("Brief stays put");

    // And unrelated steps remain pending.
    expect(screen.getByTestId("status-sitrep")).toHaveTextContent("Pending");
  });

  it("renders the artifact validation result and any violations", async () => {
    const failing = makeArtifact("brief", "complete", "Brief body");
    failing.validation = {
      valid: false,
      violations: ["Missing Recommended Action section"],
    };
    mockedGenerateStep.mockResolvedValue(makeResponse(failing));

    const user = userEvent.setup();
    render(<StagedOutputWorkspace taskId="task-1" />);

    await user.click(screen.getByTestId("regenerate-brief"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-brief")).toHaveTextContent(
        "Validation: Failed",
      );
    });
    expect(screen.getByTestId("violations-brief")).toHaveTextContent(
      "Missing Recommended Action section",
    );
  });

  it("regenerating one step does not re-invoke generation for others", async () => {
    mockedGenerateStep.mockResolvedValue(
      makeResponse(makeArtifact("sitrep", "complete")),
    );

    const user = userEvent.setup();
    render(<StagedOutputWorkspace taskId="task-1" />);

    await user.click(screen.getByTestId("regenerate-sitrep"));
    await waitFor(() => {
      expect(screen.getByTestId("status-sitrep")).toHaveTextContent("Complete");
    });

    // Only the sitrep step was ever generated.
    expect(mockedGenerateStep).toHaveBeenCalledTimes(1);
    expect(mockedGenerateStep).toHaveBeenCalledWith("task-1", "sitrep");

    // Each button carries an accessible name.
    const cub = within(screen.getByTestId("staged-step-cub"));
    expect(cub.getByRole("button", { name: /Generate Weekly CUB/i })).toBeInTheDocument();
  });
});

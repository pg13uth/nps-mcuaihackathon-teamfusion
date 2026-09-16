/**
 * Component tests for the intake flow (Task 13.1).
 *
 *  1. The form submits and the returned assumptions are shown.
 *  2. Leaving the mode unset submits WITHOUT a mode (backend recommends).
 *
 * `createTask` from the api module is mocked so tests never hit the network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Assumption } from "@sage/shared";
import type { CreateTaskRequest, CreateTaskResponse } from "../api.js";

// Mock the api module. `createTask` is a vi.fn we control per-test.
vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return {
    ...actual,
    createTask: vi.fn(),
  };
});

import { createTask } from "../api.js";
import { App } from "../App.js";

const mockedCreateTask = vi.mocked(createTask);

/** Build a canned CreateTaskResponse with the given assumptions + mode. */
function makeResponse(
  assumptions: Assumption[],
  mode: CreateTaskResponse["task"]["mode"] = "Standard",
  modeWasRecommended = false,
): CreateTaskResponse {
  return {
    task: {
      id: "task-test-1",
      requirementText: "Assess UxS integration for FY26.",
      process: "CampaignPlanning",
      tier: "Strategic",
      mode,
      modeWasRecommended,
      constraints: {},
      resolvedAssumptions: assumptions,
      routing: {
        process: "CampaignPlanning",
        tier: "Strategic",
        smesToTask: [1, 2],
        mode,
        sequence: { kind: "parallel", order: [1, 2] },
      },
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    routingPreview: {
      process: "CampaignPlanning",
      tier: "Strategic",
      smesToTask: [1, 2],
      mode,
      sequence: { kind: "parallel", order: [1, 2] },
    },
    resolvedAssumptions: assumptions,
  };
}

describe("TaskIntakeForm + AssumptionsPanel", () => {
  beforeEach(() => {
    mockedCreateTask.mockReset();
  });

  it("submits the form and renders the returned assumptions", async () => {
    const assumptions: Assumption[] = [
      {
        field: "manpowerBillets",
        text: "No billet data provided; assuming current T/O steady-state.",
      },
      {
        field: "fundingPomCycle",
        text: "No funding provided; assuming unfunded in the current POM.",
      },
    ];
    mockedCreateTask.mockResolvedValue(makeResponse(assumptions));

    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByLabelText("Specific Requirement"),
      "Assess UxS integration for FY26.",
    );
    await user.click(screen.getByRole("button", { name: "Create Task" }));

    // The AssumptionsPanel should render both returned assumptions.
    await waitFor(() => {
      expect(screen.getByTestId("assumptions-list")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/assuming current T\/O steady-state/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/assuming unfunded in the current POM/i),
    ).toBeInTheDocument();
    expect(mockedCreateTask).toHaveBeenCalledTimes(1);
  });

  it("submits WITHOUT a mode when 'Recommend' is left selected", async () => {
    mockedCreateTask.mockResolvedValue(
      makeResponse([], "FullStaff", true),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByLabelText("Specific Requirement"),
      "Stand up a crisis planning cell.",
    );
    // Deliberately do NOT change the mode selector (stays on "Recommend").
    await user.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(mockedCreateTask).toHaveBeenCalledTimes(1);
    });

    const payload = mockedCreateTask.mock.calls[0]![0] as CreateTaskRequest;
    expect(payload.requirementText).toBe("Stand up a crisis planning cell.");
    // The key assertion: no `mode` field was sent (backend recommends).
    expect("mode" in payload).toBe(false);
    expect(payload.mode).toBeUndefined();

    // With no assumptions, the empty-state message renders.
    await waitFor(() => {
      expect(screen.getByTestId("assumptions-empty")).toBeInTheDocument();
    });
  });

  it("sends only non-blank constraints so blanks become assumptions", async () => {
    mockedCreateTask.mockResolvedValue(makeResponse([]));

    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByLabelText("Specific Requirement"),
      "Curriculum refresh.",
    );
    await user.type(
      screen.getByLabelText("Manpower / Billets"),
      "12 billets",
    );
    // Leave Funding and Facilities blank.
    await user.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(mockedCreateTask).toHaveBeenCalledTimes(1);
    });

    const payload = mockedCreateTask.mock.calls[0]![0] as CreateTaskRequest;
    expect(payload.constraints).toEqual({ manpowerBillets: "12 billets" });
  });
});

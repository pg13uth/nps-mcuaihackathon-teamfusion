/**
 * Component tests for AiConfigHealth (Task 13.3, Requirement 14.3).
 *
 * Verifies the panel shows a clear, announced error state when the AI endpoint
 * is configured but unreachable, and a healthy state when reachable. Status is
 * conveyed with explicit text, not color alone.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { HealthResponse } from "../api.js";

vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return {
    ...actual,
    getHealth: vi.fn(),
  };
});

import { getHealth } from "../api.js";
import { AiConfigHealth } from "./AiConfigHealth.js";

const getHealthMock = vi.mocked(getHealth);

function health(overrides: Partial<HealthResponse["ai"]> = {}): HealthResponse {
  return {
    status: "ok",
    service: "sage-backend",
    aiConfigured: true,
    ai: {
      configured: true,
      reachable: true,
      detail: "Endpoint responded to probe.",
      ...overrides,
    },
  };
}

describe("AiConfigHealth", () => {
  beforeEach(() => {
    getHealthMock.mockReset();
  });

  it("shows an unreachable error state with a clear warning", async () => {
    getHealthMock.mockResolvedValue(
      health({
        configured: true,
        reachable: false,
        detail: "Connection timed out reaching genai.mil.",
      }),
    );
    render(<AiConfigHealth />);

    await waitFor(() =>
      expect(screen.getByTestId("health-content")).toBeInTheDocument(),
    );

    // Unhealthy state is announced.
    const alert = screen.getByRole("alert");
    expect(alert).toBe(screen.getByTestId("health-content"));

    expect(screen.getByTestId("health-status")).toHaveTextContent(/Unreachable/);
    expect(screen.getByTestId("health-detail")).toHaveTextContent(
      /Connection timed out/,
    );
    expect(screen.getByTestId("health-warning")).toHaveTextContent(
      /Generation will fail/i,
    );
  });

  it("shows a healthy state when the endpoint is reachable", async () => {
    getHealthMock.mockResolvedValue(health({ reachable: true }));
    render(<AiConfigHealth />);

    await waitFor(() =>
      expect(screen.getByTestId("health-content")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("health-status")).toHaveTextContent(/Reachable/);
    expect(screen.queryByTestId("health-warning")).not.toBeInTheDocument();
    // Healthy content is not an alert.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a not-configured error state", async () => {
    getHealthMock.mockResolvedValue(
      health({ configured: false, reachable: undefined, detail: "No endpoint set." }),
    );
    render(<AiConfigHealth />);

    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent(
        /Not configured/,
      ),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import type { RunningEstimate, TaskOutcome } from "@sage/shared";
import { RunningEstimateServiceImpl } from "./runningEstimateService.js";

/**
 * Unit tests for the RunningEstimateService (Requirements 12.1, 12.2, 12.3).
 * The universal properties (Property 13 collision detection, Property 14
 * append-only history) are covered by the optional property tests in tasks
 * 9.6 / 9.7; these tests pin down representative behavior.
 */

const service = new RunningEstimateServiceImpl();

function emptyEstimate(): RunningEstimate {
  return {
    billetBalance: "1200 billets, 95% filled",
    fundingStatus: "POM-27 baseline",
    activeCcirAlerts: [],
    revisions: [],
  };
}

describe("RunningEstimateServiceImpl", () => {
  it("appends exactly one revision per apply() call (append-only history grows by 1)", () => {
    const prev = emptyEstimate();

    const outcome1: TaskOutcome = {
      taskId: "task-1",
      billetDelta: "-12 billets",
      allocatedResources: ["Range Alpha"],
    };
    const { next: after1 } = service.apply(prev, outcome1);
    expect(after1.revisions).toHaveLength(1);

    const outcome2: TaskOutcome = {
      taskId: "task-2",
      allocatedResources: ["Range Bravo"],
    };
    const { next: after2 } = service.apply(after1, outcome2);
    expect(after2.revisions).toHaveLength(2);

    // prior revisions are preserved in order (prefix property).
    expect(after2.revisions.slice(0, 1)).toEqual(after1.revisions);
    expect(after2.revisions[0]?.taskId).toBe("task-1");
    expect(after2.revisions[1]?.taskId).toBe("task-2");
  });

  it("does not mutate the prev input", () => {
    const prev = emptyEstimate();
    const outcome: TaskOutcome = {
      taskId: "task-1",
      billetDelta: "-5 billets",
      fundingDelta: "-$1.2M",
      allocatedResources: ["Instructor SSgt Doe"],
    };

    const { next } = service.apply(prev, outcome);

    expect(prev.revisions).toHaveLength(0);
    expect(prev.billetBalance).toBe("1200 billets, 95% filled");
    expect(prev.fundingStatus).toBe("POM-27 baseline");
    expect(next).not.toBe(prev);
    expect(next.revisions).not.toBe(prev.revisions);
  });

  it("detects a collision on a re-allocated resource, naming the resource and conflicting task ids", () => {
    const prev = emptyEstimate();

    const { next: after1, collisions: c1 } = service.apply(prev, {
      taskId: "task-1",
      allocatedResources: ["Range Alpha", "Instructor SSgt Doe"],
    });
    expect(c1).toEqual([]);

    const { collisions: c2 } = service.apply(after1, {
      taskId: "task-2",
      // Range Alpha re-allocated -> collision; Range Bravo is new -> no collision.
      allocatedResources: ["Range Alpha", "Range Bravo"],
    });

    expect(c2).toHaveLength(1);
    expect(c2[0]?.resource).toBe("Range Alpha");
    expect(c2[0]?.conflictingTaskIds).toContain("task-1");
    expect(c2[0]?.conflictingTaskIds).toContain("task-2");
    expect(c2[0]?.detail).toContain("Range Alpha");
  });

  it("detects collisions case- and whitespace-insensitively", () => {
    const prev = emptyEstimate();
    const { next: after1 } = service.apply(prev, {
      taskId: "task-1",
      allocatedResources: ["Range Alpha"],
    });

    const { collisions } = service.apply(after1, {
      taskId: "task-2",
      allocatedResources: ["  range alpha  "],
    });

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.resource).toBe("range alpha");
  });

  it("reports no collision when resources do not overlap", () => {
    const prev = emptyEstimate();
    const { next: after1, collisions: c1 } = service.apply(prev, {
      taskId: "task-1",
      allocatedResources: ["Range Alpha"],
    });
    expect(c1).toEqual([]);

    const { collisions: c2 } = service.apply(after1, {
      taskId: "task-2",
      allocatedResources: ["Range Charlie", "Instructor GySgt Roe"],
    });
    expect(c2).toEqual([]);
  });

  it("updates billet and funding status from the outcome deltas", () => {
    const prev = emptyEstimate();
    const { next } = service.apply(prev, {
      taskId: "task-1",
      billetDelta: "-12 billets",
      fundingDelta: "-$3.4M",
      allocatedResources: [],
    });

    expect(next.billetBalance).toContain("-12 billets");
    expect(next.fundingStatus).toContain("-$3.4M");
    expect(next.revisions[0]?.billetBalance).toBe(next.billetBalance);
    expect(next.revisions[0]?.fundingStatus).toBe(next.fundingStatus);
  });
});

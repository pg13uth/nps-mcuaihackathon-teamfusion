/**
 * RunningEstimateService — Rule 17 running estimate + memory (pure orchestration).
 *
 * Requirements:
 *  - 12.1: persist a Running Estimate log (Billet Balance, Funding Status,
 *          Active CCIR Alerts) as a task completes.
 *  - 12.2: flag downstream resource collisions when a new task modifies a prior
 *          decision (e.g. dual-allocated ranges or instructors).
 *  - 12.3: maintain revision history.
 *
 * `apply(prev, taskOutcome)` returns a fresh `next` estimate (the `prev` input
 * is never mutated) with:
 *  - `billetBalance` / `fundingStatus` updated from the outcome's deltas,
 *  - exactly one new `RunningEstimateRevision` appended to the existing history
 *    (append-only — design Property 14),
 * plus the list of `ResourceCollision`s detected against resources already
 * allocated by prior tasks/revisions in `prev` (design Property 13).
 *
 * This module performs no I/O and is total for valid typed inputs.
 */

import type {
  ResourceCollision,
  RunningEstimate,
  RunningEstimateRevision,
  RunningEstimateService as IRunningEstimateService,
  TaskOutcome,
} from "@sage/shared";

/** Normalize a resource identifier for collision comparison (case/space-insensitive). */
function normalizeResource(resource: string): string {
  return resource.trim().toLowerCase();
}

/**
 * Apply a billet/funding delta to a prior balance string. Deltas are free-text
 * in this domain (e.g. "-12 billets", "POM-27 +$1.2M"); when a delta is present
 * we record it alongside the prior value so the running log preserves the trail
 * rather than discarding history. A blank/undefined delta leaves the value as-is.
 */
function applyDelta(prev: string, delta?: string): string {
  const trimmed = delta?.trim();
  if (!trimmed) {
    return prev;
  }
  return prev.trim().length > 0 ? `${prev} | ${trimmed}` : trimmed;
}

/**
 * Collect the set of resources already allocated by prior tasks recorded in the
 * estimate. Prior allocations are reconstructed from the revision history's
 * `summary` (which records the resources allocated at that revision) keyed by a
 * normalized resource name -> the task ids that allocated it.
 */
function priorAllocations(prev: RunningEstimate): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const rev of prev.revisions) {
    for (const resource of parseAllocatedResources(rev.summary)) {
      const key = normalizeResource(resource);
      if (key.length === 0) continue;
      const taskIds = map.get(key) ?? new Set<string>();
      taskIds.add(rev.taskId);
      map.set(key, taskIds);
    }
  }
  return map;
}

/** Marker prefix used in a revision summary to record allocated resources. */
const ALLOCATED_MARKER = "allocated:";

/**
 * Build a deterministic revision summary that records the allocated resources
 * so future `apply()` calls can detect collisions against this task.
 */
function buildSummary(outcome: TaskOutcome): string {
  const resources = outcome.allocatedResources.map((r) => r.trim()).filter((r) => r.length > 0);
  if (resources.length === 0) {
    return `Task ${outcome.taskId}: no resources allocated.`;
  }
  return `Task ${outcome.taskId}: ${ALLOCATED_MARKER} ${resources.join("; ")}`;
}

/** Recover the allocated resources previously recorded in a revision summary. */
function parseAllocatedResources(summary: string): string[] {
  const idx = summary.indexOf(ALLOCATED_MARKER);
  if (idx === -1) {
    return [];
  }
  const tail = summary.slice(idx + ALLOCATED_MARKER.length);
  return tail
    .split(";")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

export class RunningEstimateServiceImpl implements IRunningEstimateService {
  apply(
    prev: RunningEstimate,
    taskOutcome: TaskOutcome,
  ): { next: RunningEstimate; collisions: ResourceCollision[] } {
    const prior = priorAllocations(prev);

    // Property 13: detect collisions against resources already allocated.
    const collisions: ResourceCollision[] = [];
    const seenThisOutcome = new Set<string>();
    for (const rawResource of taskOutcome.allocatedResources) {
      const resource = rawResource.trim();
      if (resource.length === 0) continue;
      const key = normalizeResource(resource);
      if (seenThisOutcome.has(key)) continue; // one collision per distinct resource
      seenThisOutcome.add(key);

      const conflictingTaskIds = prior.get(key);
      if (conflictingTaskIds && conflictingTaskIds.size > 0) {
        const ids = Array.from(conflictingTaskIds);
        collisions.push({
          resource,
          conflictingTaskIds: [...ids, taskOutcome.taskId],
          detail: `Resource "${resource}" is already allocated by task(s) ${ids.join(
            ", ",
          )} and is being re-allocated by task ${taskOutcome.taskId}.`,
        });
      }
    }

    const nextBilletBalance = applyDelta(prev.billetBalance, taskOutcome.billetDelta);
    const nextFundingStatus = applyDelta(prev.fundingStatus, taskOutcome.fundingDelta);

    // Property 14: append exactly one revision; never mutate/drop prior ones.
    const revision: RunningEstimateRevision = {
      at: new Date().toISOString(),
      taskId: taskOutcome.taskId,
      summary: buildSummary(taskOutcome),
      billetBalance: nextBilletBalance,
      fundingStatus: nextFundingStatus,
    };

    const next: RunningEstimate = {
      billetBalance: nextBilletBalance,
      fundingStatus: nextFundingStatus,
      // Copy the CCIR alerts array so `next` does not share references with `prev`.
      activeCcirAlerts: [...prev.activeCcirAlerts],
      // Append-only: preserve every prior revision in order plus the new one.
      revisions: [...prev.revisions, revision],
    };

    return { next, collisions };
  }
}

/** Default singleton instance for convenient wiring. */
export const runningEstimateService: IRunningEstimateService =
  new RunningEstimateServiceImpl();

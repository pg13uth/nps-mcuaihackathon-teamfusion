import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  OutputArtifact,
  RunningEstimate,
  SourceDocument,
  Task,
} from "@sage/shared";
import { FileRepository, emptyEstimate } from "./repository.js";

/**
 * Minimal persistence round-trip tests for the file-backed Repository (task 10.5).
 * Each test uses a unique subdirectory under os.tmpdir() and cleans it up after.
 */

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `sage-repo-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeTask(id: string): Task {
  return {
    id,
    requirementText: "Stand up a new UxS course of instruction.",
    process: "CurriculumDevelopment",
    tier: "Strategic",
    mode: "FullStaff",
    modeWasRecommended: false,
    constraints: { manpowerBillets: "T/O steady-state" },
    resolvedAssumptions: [
      { field: "fundingPomCycle", text: "No POM data provided; assuming current cycle." },
    ],
    routing: {
      process: "CurriculumDevelopment",
      tier: "Strategic",
      smesToTask: [16, 29],
      mode: "FullStaff",
      sequence: { kind: "sequential", order: [16, 29] },
    },
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function makeArtifact(taskId: string, step: OutputArtifact["step"]): OutputArtifact {
  return {
    taskId,
    step,
    routingBlock: makeTask(taskId).routing,
    body: `body for ${step}`,
    citations: [{ docId: "D1", locator: "p.3" }],
    ungroundable: [],
    flaggedSources: [],
    validation: { valid: true, violations: [] },
    status: "complete",
    generatedAt: "2025-01-01T01:00:00.000Z",
  };
}

describe("FileRepository — tasks", () => {
  it("round-trips a task", async () => {
    const repo = new FileRepository(freshDataDir());
    const task = makeTask("t1");
    await repo.saveTask(task);
    expect(await repo.getTask("t1")).toEqual(task);
  });

  it("returns undefined for an unknown task", async () => {
    const repo = new FileRepository(freshDataDir());
    expect(await repo.getTask("missing")).toBeUndefined();
  });

  it("creates the data directory when missing", async () => {
    const dir = freshDataDir();
    const repo = new FileRepository(dir);
    await repo.saveTask(makeTask("t1"));
    // The nested tasks directory exists and holds a human-readable JSON file.
    const raw = await fs.readFile(path.join(dir, "tasks", "t1.json"), "utf8");
    expect(raw).toContain("\n  "); // indented / human-readable
    expect(JSON.parse(raw).id).toBe("t1");
  });
});

describe("FileRepository — output artifacts (keyed by taskId + step)", () => {
  it("round-trips an artifact keyed by task id and step", async () => {
    const repo = new FileRepository(freshDataDir());
    const brief = makeArtifact("t1", "brief");
    await repo.saveOutput(brief);
    expect(await repo.getOutput("t1", "brief")).toEqual(brief);
  });

  it("keeps different steps of the same task independent", async () => {
    const repo = new FileRepository(freshDataDir());
    const brief = makeArtifact("t1", "brief");
    const storyboard = makeArtifact("t1", "storyboard");
    await repo.saveOutput(brief);
    await repo.saveOutput(storyboard);
    expect(await repo.getOutput("t1", "brief")).toEqual(brief);
    expect(await repo.getOutput("t1", "storyboard")).toEqual(storyboard);

    // Re-saving one step does not disturb the other.
    const brief2 = { ...brief, body: "revised brief" };
    await repo.saveOutput(brief2);
    expect(await repo.getOutput("t1", "brief")).toEqual(brief2);
    expect(await repo.getOutput("t1", "storyboard")).toEqual(storyboard);
  });

  it("returns undefined for an unknown artifact", async () => {
    const repo = new FileRepository(freshDataDir());
    expect(await repo.getOutput("t1", "brief")).toBeUndefined();
  });
});

describe("FileRepository — running estimate", () => {
  it("returns a sensible empty default before anything is saved", async () => {
    const repo = new FileRepository(freshDataDir());
    expect(await repo.getEstimate()).toEqual(emptyEstimate());
  });

  it("round-trips a saved estimate", async () => {
    const repo = new FileRepository(freshDataDir());
    const estimate: RunningEstimate = {
      billetBalance: "-12 billets",
      fundingStatus: "POM-27 +$1.2M",
      activeCcirAlerts: [
        {
          category: "FiscalLaw",
          triggeringCondition: "Obligation exceeds appropriation.",
          recommendedAction: "Notify comptroller immediately.",
        },
      ],
      revisions: [
        {
          at: "2025-01-01T00:00:00.000Z",
          taskId: "t1",
          summary: "Task t1: allocated: Range Alpha",
          billetBalance: "-12 billets",
          fundingStatus: "POM-27 +$1.2M",
        },
      ],
    };
    await repo.saveEstimate(estimate);
    expect(await repo.getEstimate()).toEqual(estimate);
  });
});

describe("FileRepository — document index", () => {
  it("returns an empty array before anything is saved", async () => {
    const repo = new FileRepository(freshDataDir());
    expect(await repo.getDocIndex()).toEqual([]);
  });

  it("round-trips a document index", async () => {
    const repo = new FileRepository(freshDataDir());
    const docs: SourceDocument[] = [
      {
        docId: "D1",
        s3Key: "Agents/policy.docx",
        fileType: "docx",
        metadata: {
          Echelon: "Strategic",
          Domain: "Legal",
          Doc_Type: "Policy",
          Status: "Active",
          Topic_Tags: ["policy"],
        },
        extractedText: "some text",
      },
      { docId: "D2", s3Key: "Agents/draft.pdf", fileType: "pdf" },
    ];
    await repo.saveDocIndex(docs);
    expect(await repo.getDocIndex()).toEqual(docs);
  });

  it("overwrites the index on subsequent saves", async () => {
    const repo = new FileRepository(freshDataDir());
    await repo.saveDocIndex([{ docId: "D1", s3Key: "k1", fileType: "docx" }]);
    await repo.saveDocIndex([{ docId: "D2", s3Key: "k2", fileType: "pdf" }]);
    const docs = await repo.getDocIndex();
    expect(docs.map((d) => d.docId)).toEqual(["D2"]);
  });
});

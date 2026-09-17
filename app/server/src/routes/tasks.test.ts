import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../index.js";
import { createOutputValidator } from "./index.js";
import {
  CcirEngineImpl,
  CitationCheckerImpl,
  DefaultConstraintResolver,
  DefaultRoutingBlockBuilder,
  DefaultSmeSelector,
  GroundingFilterImpl,
  HeuristicModeRecommender,
  PromptAssemblerImpl,
  RunningEstimateServiceImpl,
  SynthesisGateImpl,
} from "../orchestration/index.js";
import type { TaskRouteDeps } from "./tasks.js";
import type {
  AiClient,
  AiResult,
  AppConfig,
  AssembledPrompt,
  OutputArtifact,
  OutputStep,
  Repository,
  RunningEstimate,
  SourceDocument,
  Task,
} from "@sage/shared";

/**
 * Route tests for task intake + staged generation (Task 12.2).
 *
 * Uses the REAL pure orchestration layer with in-memory fakes for the two
 * side-effecting adapters (AI + persistence) — no real network or disk. These
 * cover: task creation + persistence, empty-requirement rejection, a brief
 * generation step producing an artifact, staged-regeneration isolation
 * (design Property 16), and the AI-failure path preserving inputs.
 */

// --- In-memory fake repository ----------------------------------------------

class InMemoryRepository implements Repository {
  tasks = new Map<string, Task>();
  outputs = new Map<string, OutputArtifact>();
  estimate: RunningEstimate = {
    billetBalance: "",
    fundingStatus: "",
    activeCcirAlerts: [],
    revisions: [],
  };
  docIndex: SourceDocument[] = [];

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, structuredClone(task));
  }
  async getTask(id: string): Promise<Task | undefined> {
    const t = this.tasks.get(id);
    return t ? structuredClone(t) : undefined;
  }
  async saveOutput(artifact: OutputArtifact): Promise<void> {
    this.outputs.set(`${artifact.taskId}__${artifact.step}`, structuredClone(artifact));
  }
  async getOutput(taskId: string, step: OutputStep): Promise<OutputArtifact | undefined> {
    const a = this.outputs.get(`${taskId}__${step}`);
    return a ? structuredClone(a) : undefined;
  }
  async getEstimate(): Promise<RunningEstimate> {
    return structuredClone(this.estimate);
  }
  async saveEstimate(estimate: RunningEstimate): Promise<void> {
    this.estimate = structuredClone(estimate);
  }
  async saveDocIndex(docs: SourceDocument[]): Promise<void> {
    this.docIndex = structuredClone(docs);
  }
  async getDocIndex(): Promise<SourceDocument[]> {
    return structuredClone(this.docIndex);
  }
}

// --- Fake AI client ---------------------------------------------------------

/** A fake AI client that returns queued responses (or a canned success). */
class FakeAiClient implements AiClient {
  calls: AssembledPrompt[] = [];
  responder: (prompt: AssembledPrompt) => AiResult;

  constructor(responder?: (prompt: AssembledPrompt) => AiResult) {
    this.responder =
      responder ??
      (() => ({ ok: true, text: "default response", truncated: false }));
  }

  async complete(prompt: AssembledPrompt): Promise<AiResult> {
    this.calls.push(prompt);
    return this.responder(prompt);
  }
}

// --- Config + deps builders -------------------------------------------------

const AI_CONFIGURED: AppConfig = {
  ai: { endpoint: "https://ai.example/v1", model: "test-model" },
  s3: { bucket: "b", region: "us-east-1", prefix: "" },
  persistence: { dataDir: "./.unused-in-tests" },
};

/** A well-formed 3-Star brief that passes the structural + gate checks. */
const GOOD_BRIEF = [
  "ROUTING BLOCK",
  "BLUF: Sir/Ma'am, we must approve COA A now. This preserves enterprise readiness. It mitigates strategic risk.",
  "Strategic Context: This is an enterprise-level, strategic issue for TECOM.",
  "Synthesized Analysis: A unified strategic narrative across domains.",
  "Assumptions & Limitations: Billets treated as an open assumption.",
  "Risk Assessment: Manageable strategic risk.",
  "Resource & Policy Implications: Manpower/T-O, Funding/POM, and Facilities/Ranges are addressed.",
  "Recommended Action: Approve COA A or disapprove in favor of COA B.",
].join("\n\n");

function buildTestDeps(
  overrides: Partial<TaskRouteDeps> & { aiClient?: AiClient } = {},
): { deps: TaskRouteDeps; repo: InMemoryRepository; ai: FakeAiClient } {
  const repo = (overrides.repository as InMemoryRepository) ?? new InMemoryRepository();
  const ai = (overrides.aiClient as FakeAiClient) ?? new FakeAiClient();
  let counter = 0;

  const deps: TaskRouteDeps = {
    config: overrides.config ?? AI_CONFIGURED,
    repository: repo,
    constraintResolver: new DefaultConstraintResolver(),
    modeRecommender: new HeuristicModeRecommender(),
    smeSelector: new DefaultSmeSelector(),
    routingBlockBuilder: new DefaultRoutingBlockBuilder(),
    groundingFilter: new GroundingFilterImpl(),
    promptAssembler: new PromptAssemblerImpl(),
    outputValidator: createOutputValidator(),
    citationChecker: new CitationCheckerImpl(),
    synthesisGate: new SynthesisGateImpl(),
    ccirEngine: new CcirEngineImpl(),
    runningEstimateService: new RunningEstimateServiceImpl(),
    aiClient: ai,
    generateId: () => `test-task-${++counter}`,
    ...overrides,
  };
  return { deps, repo, ai };
}

// --- Tests ------------------------------------------------------------------

describe("POST /tasks", () => {
  let repo: InMemoryRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const built = buildTestDeps();
    repo = built.repo;
    app = createApp({ config: AI_CONFIGURED, taskDeps: built.deps });
  });

  it("creates and persists a task with routing preview and resolved assumptions", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({
        requirementText: "Assess UxS integration across the enterprise.",
        process: "CapabilityAssessment",
        tier: "Strategic",
        mode: "FullStaff",
        constraints: { manpowerBillets: "120 billets" },
      });

    expect(res.status).toBe(201);
    expect(res.body.task.id).toBe("test-task-1");
    expect(res.body.task.mode).toBe("FullStaff");
    expect(res.body.task.modeWasRecommended).toBe(false);
    // Routing preview identifies the tasked SMEs (Property 1).
    expect(res.body.routingPreview.smesToTask.length).toBeGreaterThan(0);
    // Blank funding + facilities become explicit assumptions (Requirement 1.3).
    const fields = res.body.resolvedAssumptions.map((a: { field: string }) => a.field);
    expect(fields).toContain("fundingPomCycle");
    expect(fields).toContain("facilitiesRanges");
    expect(fields).not.toContain("manpowerBillets");

    // Persisted.
    const stored = await repo.getTask("test-task-1");
    expect(stored?.requirementText).toBe(
      "Assess UxS integration across the enterprise.",
    );
  });

  it("recommends a mode when none is provided", async () => {
    const res = await request(app).post("/tasks").send({
      requirementText: "Immediate crisis response required for a breach.",
      process: "CrisisResponse",
      tier: "Operational",
    });

    expect(res.status).toBe(201);
    expect(res.body.task.modeWasRecommended).toBe(true);
    expect(res.body.task.mode).toBe("CrisisAction");
  });

  it("rejects empty requirement text at the boundary and persists nothing", async () => {
    const res = await request(app).post("/tasks").send({
      requirementText: "   ",
      process: "CampaignPlanning",
      tier: "Strategic",
    });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("requirementText");
    expect(repo.tasks.size).toBe(0);
  });

  it("rejects a missing/invalid process", async () => {
    const res = await request(app).post("/tasks").send({
      requirementText: "Valid requirement.",
      tier: "Strategic",
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("process");
  });
});

describe("POST /tasks/:id/generate/:step", () => {
  async function createTask(
    app: ReturnType<typeof createApp>,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await request(app).post("/tasks").send(body);
    expect(res.status).toBe(201);
    return res.body.task.id as string;
  }

  it("produces a brief artifact and runs the synthesis gate", async () => {
    const built = buildTestDeps({
      aiClient: new FakeAiClient(() => ({
        ok: true,
        text: GOOD_BRIEF,
        truncated: false,
      })),
    });
    const app = createApp({ config: AI_CONFIGURED, taskDeps: built.deps });

    const id = await createTask(app, {
      requirementText: "Provide the executive brief for UxS integration.",
      process: "CapabilityAssessment",
      tier: "Strategic",
      mode: "FullStaff",
    });

    const res = await request(app).post(`/tasks/${id}/generate/brief`).send();

    expect(res.status).toBe(201);
    expect(res.body.artifact.step).toBe("brief");
    expect(res.body.artifact.status).toBe("complete");
    expect(res.body.artifact.body).toContain("BLUF");
    // Briefs carry a Synthesis Gate result (Requirement 11.1).
    expect(res.body.artifact.gate).toBeDefined();
    expect(res.body.artifact.validation.valid).toBe(true);
    // Persisted under the brief key.
    const stored = await built.repo.getOutput(id, "brief");
    expect(stored).toBeDefined();
  });

  it("regenerating a different step leaves the first step's artifact intact (Property 16)", async () => {
    const built = buildTestDeps({
      aiClient: new FakeAiClient((prompt) => ({
        ok: true,
        // Return a body that echoes the step so we can detect cross-contamination.
        text: prompt.step === "brief" ? GOOD_BRIEF : "STORYBOARD BODY",
        truncated: false,
      })),
    });
    const app = createApp({ config: AI_CONFIGURED, taskDeps: built.deps });

    const id = await createTask(app, {
      requirementText: "Full staff build for UxS integration.",
      process: "CapabilityAssessment",
      tier: "Strategic",
      mode: "FullStaff",
    });

    // Generate the brief first.
    await request(app).post(`/tasks/${id}/generate/brief`).send();
    const briefBefore = await built.repo.getOutput(id, "brief");
    expect(briefBefore?.body).toBe(GOOD_BRIEF);

    // Now generate the storyboard — a different step.
    const storyRes = await request(app)
      .post(`/tasks/${id}/generate/storyboard`)
      .send();
    expect(storyRes.status).toBe(201);
    expect(storyRes.body.artifact.step).toBe("storyboard");

    // The brief artifact must be byte-for-byte unchanged.
    const briefAfter = await built.repo.getOutput(id, "brief");
    expect(briefAfter).toEqual(briefBefore);
    expect(briefAfter?.body).toBe(GOOD_BRIEF);
    // And the storyboard is its own artifact.
    const storyStored = await built.repo.getOutput(id, "storyboard");
    expect(storyStored?.body).toBe("STORYBOARD BODY");
  });

  it("preserves inputs and returns a clear error on AI failure", async () => {
    const built = buildTestDeps({
      aiClient: new FakeAiClient(() => ({
        ok: false,
        errorMessage: "AI endpoint unreachable at ai.example.",
        truncated: false,
      })),
    });
    const app = createApp({ config: AI_CONFIGURED, taskDeps: built.deps });

    const id = await createTask(app, {
      requirementText: "Brief that will hit an AI failure.",
      process: "CampaignPlanning",
      tier: "Strategic",
      mode: "Standard",
    });

    const res = await request(app).post(`/tasks/${id}/generate/brief`).send();

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("unreachable");
    // The error carries no secret material.
    expect(JSON.stringify(res.body)).not.toContain("test-model");
    // The task and its inputs are preserved (never deleted).
    const stillThere = await built.repo.getTask(id);
    expect(stillThere?.requirementText).toBe("Brief that will hit an AI failure.");
    // No artifact was persisted for the failed step.
    expect(await built.repo.getOutput(id, "brief")).toBeUndefined();
  });

  it("guards generation when AI is not configured (503) and preserves the task", async () => {
    const notConfigured: AppConfig = {
      ...AI_CONFIGURED,
      ai: { endpoint: "", model: "" },
    };
    const built = buildTestDeps({ config: notConfigured });
    const app = createApp({ config: notConfigured, taskDeps: built.deps });

    const id = await createTask(app, {
      requirementText: "Brief with unconfigured AI.",
      process: "CampaignPlanning",
      tier: "Strategic",
      mode: "Standard",
    });

    const res = await request(app).post(`/tasks/${id}/generate/brief`).send();
    expect(res.status).toBe(503);
    expect(await built.repo.getTask(id)).toBeDefined();
  });

  it("rejects an invalid output step (400) and a missing task (404)", async () => {
    const built = buildTestDeps();
    const app = createApp({ config: AI_CONFIGURED, taskDeps: built.deps });

    const id = await createTask(app, {
      requirementText: "Valid task.",
      process: "CampaignPlanning",
      tier: "Strategic",
      mode: "Standard",
    });

    const badStep = await request(app)
      .post(`/tasks/${id}/generate/not-a-step`)
      .send();
    expect(badStep.status).toBe(400);
    expect(badStep.body.field).toBe("step");

    const missing = await request(app)
      .post(`/tasks/nope/generate/brief`)
      .send();
    expect(missing.status).toBe(404);
  });
});

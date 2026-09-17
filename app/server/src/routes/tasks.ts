/**
 * Task + staged-generation routes (Task 12.2).
 *
 * Two endpoints, wired to the pure orchestration layer and the side-effecting
 * adapters via dependency injection so they are testable with in-memory fakes:
 *
 *  - `POST /tasks`
 *      Intake (Requirement 1.1) + constraint resolution (1.3) + mode
 *      recommendation when none chosen (2.1/2.2) + SME selection (3.1) +
 *      routing block build (4.1). Persists the task and responds with the
 *      created task plus a routing preview and the resolved assumptions.
 *      Empty requirement text is rejected at the boundary (400) and nothing is
 *      persisted.
 *
 *  - `POST /tasks/:id/generate/:step`
 *      Runs the staged pipeline for ONE output step (Requirement 15.1/15.2,
 *      3.2): grounding (GroundingFilter over the persisted doc index) ->
 *      prompt assembly (PromptAssembler) -> AI call (AiClient) -> structural
 *      validation (the right validator for `:step`) -> citation check
 *      (CitationChecker) -> for briefs, the Synthesis Gate -> CCIR evaluation +
 *      running-estimate update. Persists the OutputArtifact for that step only,
 *      so regenerating one step never mutates another step's artifact
 *      (design Property 16).
 *
 * Error handling (design "Error Handling"):
 *  - AI not configured -> 503 guard error (Requirement 14.1), inputs preserved.
 *  - AI failure/unreachable -> 502 with the adapter's clear, secret-free error
 *    (Requirement 14.3); the task and all inputs are preserved (never deleted).
 *  - Unknown task id -> 404. Invalid `:step` -> 400.
 */

import { Router, type Request, type Response } from "express";
import { isAiConfigured } from "../config.js";
import { HIERARCHY_OF_TRUTH } from "../orchestration/index.js";
import type {
  AiClient,
  AppConfig,
  Assumption,
  CcirEngine,
  CitationChecker,
  ConstraintResolver,
  Constraints,
  CoreProcess,
  GroundingFilter,
  ModeRecommender,
  OperationalMode,
  OutputArtifact,
  OutputStep,
  OutputValidator,
  PromptAssembler,
  Repository,
  RoutingBlockBuilder,
  RunningEstimateService,
  SmeSelector,
  SourceDocument,
  SynthesisGate,
  Task,
  Tier,
  ValidationResult,
} from "@sage/shared";

/** Concrete collaborators the task routes depend on (injected in createApp). */
export interface TaskRouteDeps {
  config: AppConfig;
  repository: Repository;
  constraintResolver: ConstraintResolver;
  modeRecommender: ModeRecommender;
  smeSelector: SmeSelector;
  routingBlockBuilder: RoutingBlockBuilder;
  groundingFilter: GroundingFilter;
  promptAssembler: PromptAssembler;
  outputValidator: OutputValidator;
  citationChecker: CitationChecker;
  synthesisGate: SynthesisGate;
  ccirEngine: CcirEngine;
  runningEstimateService: RunningEstimateService;
  aiClient: AiClient;
  /** Injectable id generator (defaults to a time+random slug) so tests are deterministic. */
  generateId?: () => string;
}

/** The valid output steps, used to validate the `:step` path segment. */
const OUTPUT_STEPS: readonly OutputStep[] = [
  "brief",
  "storyboard",
  "sitrep",
  "cub",
  "qpr",
  "order",
  "curriculum",
] as const;

const CORE_PROCESSES: readonly CoreProcess[] = [
  "ProgramObjectiveMemorandum",
  "CampaignPlanning",
  "CurriculumDevelopment",
  "CapabilityAssessment",
  "CrisisResponse",
  "PolicyDevelopment",
] as const;

const TIERS: readonly Tier[] = ["Strategic", "Operational", "Tactical"] as const;

const OPERATIONAL_MODES: readonly OperationalMode[] = [
  "Lite",
  "Standard",
  "FullStaff",
  "CrisisAction",
] as const;

function isOutputStep(value: string): value is OutputStep {
  return (OUTPUT_STEPS as readonly string[]).includes(value);
}

/** Pick the correct structural validator for the requested step. */
function validateForStep(
  validator: OutputValidator,
  step: OutputStep,
  text: string,
): ValidationResult {
  switch (step) {
    case "brief":
      return validator.validateBrief(text);
    case "storyboard":
      return validator.validateStoryboard(text);
    case "sitrep":
      return validator.validateSitrep(text);
    case "cub":
      return validator.validateCub(text);
    case "qpr":
      return validator.validateQpr(text);
    case "order":
      return validator.validateOrder(text);
    case "curriculum":
      return validator.validateCurriculum(text);
  }
}

/** Default deterministic-enough id generator. */
function defaultGenerateId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize an incoming constraints object to only the known string fields. */
function normalizeConstraints(raw: unknown): Constraints {
  const source = (raw ?? {}) as Record<string, unknown>;
  const pick = (key: keyof Constraints): string | undefined => {
    const value = source[key];
    return typeof value === "string" ? value : undefined;
  };
  const constraints: Constraints = {};
  const manpower = pick("manpowerBillets");
  const funding = pick("fundingPomCycle");
  const facilities = pick("facilitiesRanges");
  if (manpower !== undefined) constraints.manpowerBillets = manpower;
  if (funding !== undefined) constraints.fundingPomCycle = funding;
  if (facilities !== undefined) constraints.facilitiesRanges = facilities;
  return constraints;
}

/**
 * Build the task/generation router with the provided dependencies. Kept as a
 * factory so the concrete orchestration + adapters are injected from
 * createApp() and swapped for fakes in tests.
 */
export function createTaskRouter(deps: TaskRouteDeps): Router {
  const router = Router();
  const generateId = deps.generateId ?? defaultGenerateId;

  // --- POST /tasks -------------------------------------------------------
  router.post("/tasks", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Requirement 1.1: requirement text is required and must be non-empty.
    const requirementText =
      typeof body.requirementText === "string" ? body.requirementText : "";
    if (requirementText.trim().length === 0) {
      res.status(400).json({
        error: "requirementText is required and must not be empty.",
        field: "requirementText",
      });
      return;
    }

    // Process (Requirement 1.4) — required to drive SME routing.
    const process = body.process;
    if (typeof process !== "string" || !(CORE_PROCESSES as readonly string[]).includes(process)) {
      res.status(400).json({
        error: `process is required and must be one of: ${CORE_PROCESSES.join(", ")}.`,
        field: "process",
      });
      return;
    }

    // Tier — required; drives SME tier filtering and echelon compartmentalization.
    const tier = body.tier;
    if (typeof tier !== "string" || !(TIERS as readonly string[]).includes(tier)) {
      res.status(400).json({
        error: `tier is required and must be one of: ${TIERS.join(", ")}.`,
        field: "tier",
      });
      return;
    }

    // Mode is optional (Requirement 2.1/2.2): recommend one when absent/blank.
    const rawMode = typeof body.mode === "string" ? body.mode : "";
    let mode: OperationalMode;
    let modeWasRecommended: boolean;
    if ((OPERATIONAL_MODES as readonly string[]).includes(rawMode)) {
      mode = rawMode as OperationalMode;
      modeWasRecommended = false;
    } else {
      mode = deps.modeRecommender.recommend({
        requirementText,
        process: process as CoreProcess,
      });
      modeWasRecommended = true;
    }

    const constraints = normalizeConstraints(body.constraints);

    // Constraint resolution (Requirement 1.3): blanks -> explicit assumptions.
    const { resolved, assumptions } = deps.constraintResolver.resolve(constraints);

    // SME selection + sequencing (Requirement 3.1) and routing block (4.1).
    const { smes, sequence } = deps.smeSelector.select({
      process: process as CoreProcess,
      tier: tier as Tier,
      mode,
    });
    const routing = deps.routingBlockBuilder.build({
      process: process as CoreProcess,
      tier: tier as Tier,
      mode,
      smes,
      sequence,
    });

    const task: Task = {
      id: generateId(),
      requirementText,
      process: process as CoreProcess,
      tier: tier as Tier,
      mode,
      modeWasRecommended,
      constraints: resolved,
      resolvedAssumptions: assumptions,
      routing,
      createdAt: new Date().toISOString(),
    };

    await deps.repository.saveTask(task);

    res.status(201).json({
      task,
      routingPreview: routing,
      resolvedAssumptions: assumptions,
    });
  });

  // --- POST /tasks/:id/generate/:step -----------------------------------
  router.post(
    "/tasks/:id/generate/:step",
    async (req: Request, res: Response) => {
      const { id, step } = req.params as { id: string; step: string };

      // Validate the step against the OutputStep union (Requirement 15.1).
      if (!isOutputStep(step)) {
        res.status(400).json({
          error: `Unknown output step "${step}". Must be one of: ${OUTPUT_STEPS.join(", ")}.`,
          field: "step",
        });
        return;
      }

      // Load the task — inputs are preserved; a missing task is a 404.
      const task = await deps.repository.getTask(id);
      if (!task) {
        res.status(404).json({ error: `Task "${id}" not found.` });
        return;
      }

      // Guard: AI must be configured before we attempt generation
      // (Requirement 14.1). The task and its inputs are preserved.
      if (!isAiConfigured(deps.config)) {
        res.status(503).json({
          error:
            "AI is not configured. Set the AI endpoint and model before generating output.",
          taskId: task.id,
        });
        return;
      }

      // Grounding (Requirement 3.2 / Rules 5,9,10) over the persisted doc index.
      const docIndex: SourceDocument[] = await deps.repository.getDocIndex();
      const { grounding, flaggedSources } = deps.groundingFilter.filter(
        docIndex,
        task.tier,
      );

      // Prompt assembly (Rules 3,4,6-10).
      const assumptions: Assumption[] = task.resolvedAssumptions;
      const prompt = deps.promptAssembler.assemble({
        step,
        routing: task.routing,
        requirementText: task.requirementText,
        resolvedConstraints: task.constraints,
        assumptions,
        grounding,
        hierarchyOfTruth: HIERARCHY_OF_TRUTH,
      });

      // AI call (Rule 14). On failure the task/inputs are preserved and a
      // clear, secret-free error is surfaced (Requirement 14.3).
      const aiResult = await deps.aiClient.complete(prompt);
      if (!aiResult.ok || typeof aiResult.text !== "string") {
        res.status(502).json({
          error:
            aiResult.errorMessage ?? "AI generation failed; no output produced.",
          taskId: task.id,
          step,
        });
        return;
      }

      const body = aiResult.text;

      // Structural validation for this step (Rules 6-10).
      const validation = validateForStep(deps.outputValidator, step, body);

      // Citation check (Rules 5,9): verify or flag every bracketed citation.
      const { verified, ungroundable } = deps.citationChecker.check(body, grounding);

      // Synthesis Gate for full briefs only (Rule 15 / Requirement 11.1).
      const gate =
        step === "brief"
          ? deps.synthesisGate.run({ briefText: body, grounding })
          : undefined;

      const status: OutputArtifact["status"] = aiResult.truncated
        ? "truncated"
        : "complete";

      const artifact: OutputArtifact = {
        taskId: task.id,
        step,
        routingBlock: task.routing,
        body,
        citations: verified,
        ungroundable,
        flaggedSources: flaggedSources.map((d) => d.docId),
        validation,
        ...(gate ? { gate } : {}),
        status,
        generatedAt: new Date().toISOString(),
      };

      // Persist ONLY this step's artifact (design Property 16: regenerating one
      // step never mutates another step's stored artifact).
      await deps.repository.saveOutput(artifact);

      // CCIR evaluation + running-estimate update (Rules 13, 17).
      const prevEstimate = await deps.repository.getEstimate();
      const ccirAlerts = deps.ccirEngine.evaluate({
        constraints: task.constraints,
        estimate: prevEstimate,
      });
      const { next: nextEstimate, collisions } =
        deps.runningEstimateService.apply(prevEstimate, {
          taskId: task.id,
          allocatedResources: [],
        });
      // Reflect the freshly evaluated CCIR alerts on the persisted estimate.
      nextEstimate.activeCcirAlerts = ccirAlerts;
      await deps.repository.saveEstimate(nextEstimate);

      res.status(201).json({
        artifact,
        ccirAlerts,
        collisions,
        estimate: nextEstimate,
      });
    },
  );

  return router;
}

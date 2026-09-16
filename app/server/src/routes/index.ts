/**
 * Route wiring for the SAGE backend.
 *
 * `buildDefaultTaskDeps` constructs the concrete orchestration + adapter
 * instances from an {@link AppConfig} and assembles them into the
 * {@link TaskRouteDeps} the task/generation router needs. Keeping this in one
 * place lets createApp() wire real dependencies while tests inject fakes.
 */

import type { AppConfig, OutputValidator, ValidationResult } from "@sage/shared";
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
  validateBrief,
  validateCub,
  validateCurriculum,
  validateOrder,
  validateQpr,
  validateSitrep,
  validateStoryboard,
} from "../orchestration/index.js";
import {
  AiClientImpl,
  FileRepository,
  S3DocumentAdapterImpl,
} from "../adapters/index.js";
import type { TaskRouteDeps } from "./tasks.js";
import type { DocumentRouteDeps } from "./documents.js";

export { createTaskRouter } from "./tasks.js";
export type { TaskRouteDeps } from "./tasks.js";
export { createDocumentRouter } from "./documents.js";
export type { DocumentRouteDeps, AiReachabilityProbe } from "./documents.js";

/**
 * Compose the individual pure validator functions into a single
 * {@link OutputValidator} implementing every step's `validate*` method.
 */
export function createOutputValidator(): OutputValidator {
  return {
    validateBrief: (text: string): ValidationResult => validateBrief(text),
    validateStoryboard: (text: string): ValidationResult => validateStoryboard(text),
    validateSitrep: (text: string): ValidationResult => validateSitrep(text),
    validateCub: (text: string): ValidationResult => validateCub(text),
    validateQpr: (text: string): ValidationResult => validateQpr(text),
    validateOrder: (text: string): ValidationResult => validateOrder(text),
    validateCurriculum: (text: string): ValidationResult => validateCurriculum(text),
  };
}

/**
 * Build the default (production) task-route dependencies from config: real
 * orchestration instances plus the file-backed repository and the
 * OpenAI-compatible AI client.
 */
export function buildDefaultTaskDeps(config: AppConfig): TaskRouteDeps {
  return {
    config,
    repository: new FileRepository(config.persistence.dataDir),
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
    aiClient: new AiClientImpl(config.ai),
  };
}

/**
 * Build the default (production) document/estimate/health-route dependencies
 * from config: the S3 document adapter (ambient AWS credential chain) and the
 * file-backed repository. The AI reachability probe defaults to the router's
 * built-in, never-throwing probe.
 */
export function buildDefaultDocumentDeps(config: AppConfig): DocumentRouteDeps {
  return {
    config,
    repository: new FileRepository(config.persistence.dataDir),
    s3: new S3DocumentAdapterImpl(config.s3),
  };
}

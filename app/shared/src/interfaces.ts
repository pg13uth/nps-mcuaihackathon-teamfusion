/**
 * Orchestration (pure) and adapter (side-effecting) service interfaces.
 * See design.md "Backend Service Interfaces".
 */

import type {
  CoreProcess,
  HierarchyOfTruth,
  OperationalMode,
  OutputStep,
  Tier,
} from "./enums.js";
import type {
  AiResult,
  AssembledPrompt,
  Assumption,
  CcirAlert,
  Citation,
  Constraints,
  OutputArtifact,
  ResourceCollision,
  RoutingBlock,
  RunningEstimate,
  Sme,
  SmeSequence,
  SourceDocument,
  SynthesisGateResult,
  Task,
  TaskOutcome,
  UngroundableClaim,
  ValidationResult,
} from "./models.js";

// --- Adapter support types ---

/** Reference to an S3 object as listed by the document adapter. */
export interface S3ObjectRef {
  key: string;
  fileType: "docx" | "pdf";
  size?: number;
  lastModified?: string;
}

/** Result of extracting text from a document object. */
export interface ExtractedText {
  text: string;
  /** true when only part of the document could be parsed */
  partial: boolean;
  /** true when the file type/content could not be parsed at all */
  notParsed: boolean;
}

// --- Orchestration (pure) ---

export interface ModeRecommender {
  /** Rule 16: recommend a mode from requirement text + process when none chosen. */
  recommend(input: { requirementText: string; process: CoreProcess }): OperationalMode;
}

export interface SmeSelector {
  /** Rules 1,2,3,11,12: choose SMEs and their sequence from the 34-SME arsenal. */
  select(input: {
    process: CoreProcess;
    tier: Tier;
    mode: OperationalMode;
  }): { smes: Sme[]; sequence: SmeSequence };
}

export interface RoutingBlockBuilder {
  /** Rule 14: PROCESS, TIER, SMEs TO TASK, MODE, SEQUENCE. */
  build(input: {
    process: CoreProcess;
    tier: Tier;
    mode: OperationalMode;
    smes: Sme[];
    sequence: SmeSequence;
  }): RoutingBlock;
}

export interface ConstraintResolver {
  /** Rule R1.3: blank constraints -> explicit assumptions. */
  resolve(constraints: Constraints): {
    resolved: Constraints;
    assumptions: Assumption[];
  };
}

export interface GroundingFilter {
  /**
   * Rules 5,9,10.4: only tagged docs ground output; flag Superseded/Draft.
   *
   * @param docs candidate source documents.
   * @param tier optional target generation tier. When `tier === "Strategic"`,
   *   echelon compartmentalization (design Property 6) is enforced: a document
   *   whose only echelon tag is `Tactical` is excluded from grounding. Added as
   *   an optional parameter (minimal, backwards-compatible extension) so the
   *   pure filter can enforce compartmentalization without a separate call.
   */
  filter(
    docs: SourceDocument[],
    tier?: Tier,
  ): {
    /** fully tagged; usable */
    grounding: SourceDocument[];
    /** missing metadata (or compartmentalized out) -> excluded */
    excluded: SourceDocument[];
    /** tagged Superseded/Draft -> usable but flagged */
    flaggedSources: SourceDocument[];
  };
}

export interface PromptAssembler {
  /** Rules 3,4,6-10: build a staged prompt string for one output step. */
  assemble(input: {
    step: OutputStep;
    routing: RoutingBlock;
    requirementText: string;
    resolvedConstraints: Constraints;
    assumptions: Assumption[];
    grounding: SourceDocument[];
    /** Legality > Doctrine/Strategy > Feasibility > Human Dynamics */
    hierarchyOfTruth: HierarchyOfTruth;
  }): AssembledPrompt;
}

export interface OutputValidator {
  /** Rules 6-10: validate returned prose against structural rules. */
  validateBrief(text: string): ValidationResult; // Rule 6 sections + BLUF + binary decision
  validateStoryboard(text: string): ValidationResult; // Rule 7/8: 6 slides + word limits
  validateSitrep(text: string): ValidationResult; // Rule 10: 5-line report
  validateCub(text: string): ValidationResult;
  validateQpr(text: string): ValidationResult;
  validateOrder(text: string): ValidationResult;
  validateCurriculum(text: string): ValidationResult;
}

export interface SynthesisGate {
  /** Rule 15: Legal Clearance, Strategic Uplift, Citation Verification, Binary Decision Point. */
  run(input: { briefText: string; grounding: SourceDocument[] }): SynthesisGateResult;
}

export interface CitationChecker {
  /** Rules 5,9: every bracketed [Doc_ID,...] must map to an Active grounding doc. */
  check(
    text: string,
    grounding: SourceDocument[],
  ): {
    verified: Citation[];
    /** flagged, not invented */
    ungroundable: UngroundableClaim[];
  };
}

export interface CcirEngine {
  /** Rule 13: evaluate thresholds -> alerts with recommended action. */
  evaluate(input: { constraints: Constraints; estimate: RunningEstimate }): CcirAlert[];
}

export interface RunningEstimateService {
  /** Rule 17: persist + detect downstream resource collisions + revision history. */
  apply(
    prev: RunningEstimate,
    taskOutcome: TaskOutcome,
  ): {
    next: RunningEstimate;
    collisions: ResourceCollision[];
  };
}

// --- Adapters (side effects) ---

export interface AiClient {
  /** Rule 14: OpenAI-compatible; endpoint/model/creds from config; clear error if unreachable. */
  complete(prompt: AssembledPrompt): Promise<AiResult>;
}

export interface S3DocumentAdapter {
  /** Rule 10: ambient credential chain; list docx/pdf under configured prefix. */
  list(prefix: string): Promise<S3ObjectRef[]>;
  get(key: string): Promise<Buffer>;
}

export interface TextExtractor {
  extract(objectRef: S3ObjectRef, bytes: Buffer): Promise<ExtractedText>; // docx/pdf
}

export interface Repository {
  saveTask(task: Task): Promise<void>;
  getTask(id: string): Promise<Task | undefined>;
  saveOutput(artifact: OutputArtifact): Promise<void>;
  getOutput(taskId: string, step: OutputStep): Promise<OutputArtifact | undefined>;
  getEstimate(): Promise<RunningEstimate>;
  saveEstimate(estimate: RunningEstimate): Promise<void>;
  saveDocIndex(docs: SourceDocument[]): Promise<void>;
  getDocIndex(): Promise<SourceDocument[]>;
}

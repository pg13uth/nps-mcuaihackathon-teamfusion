/**
 * Domain data models aligned to the SAGE directive.
 * See design.md "Data Models" section.
 */

import type {
  CcirCategory,
  CoreProcess,
  DocStatus,
  OperationalMode,
  OutputStep,
  SmeCategory,
  SmeSequenceKind,
  Tier,
} from "./enums.js";

// --- SME arsenal (34 SMEs) ---

export interface Sme {
  /** 1..34 */
  id: number;
  name: string;
  tier: Tier;
  /** e.g. ["Legal"], ["Logistics"] */
  domains: string[];
  category: SmeCategory;
  /**
   * Hierarchy-of-Truth rank (1..4) mirroring the SME arsenal manifest.
   * 1 = Legality, 2 = Doctrine/Strategy, 3 = Feasibility, 4 = Human Dynamics.
   * Used by the SME selector for downstream conflict-resolution ordering.
   */
  hierarchyRank?: number;
}

export interface SmeSequence {
  kind: SmeSequenceKind;
  /** SME ids in execution order (for sequential/handoff). */
  order: number[];
}

// --- Task + constraints (Requirement 1) ---

export interface Constraints {
  /** undefined/blank -> becomes an Assumption */
  manpowerBillets?: string;
  fundingPomCycle?: string;
  facilitiesRanges?: string;
}

export interface Assumption {
  field: keyof Constraints;
  /** e.g. "No billet data provided; assuming current T/O steady-state." */
  text: string;
}

export interface Task {
  id: string;
  /** the [INSERT SPECIFIC REQUIREMENT HERE] */
  requirementText: string;
  process: CoreProcess;
  tier: Tier;
  mode: OperationalMode;
  modeWasRecommended: boolean;
  constraints: Constraints;
  resolvedAssumptions: Assumption[];
  routing: RoutingBlock;
  createdAt: string;
}

// --- Routing block (Rule 14) ---

export interface RoutingBlock {
  process: CoreProcess;
  tier: Tier;
  /** specific numbered SMEs mobilized */
  smesToTask: number[];
  mode: OperationalMode;
  sequence: SmeSequence;
}

// --- Documents + metadata (Requirement 10) ---

/** The five required metadata keys. */
export interface DocumentMetadata {
  Echelon: string;
  Domain: string;
  Doc_Type: string;
  Status: DocStatus;
  Topic_Tags: string[];
}

export interface SourceDocument {
  /** used in [Doc_ID, ...] citations */
  docId: string;
  s3Key: string;
  fileType: "docx" | "pdf";
  /** absent/incomplete -> excluded from grounding */
  metadata?: DocumentMetadata;
  extractedText?: string;
}

// --- Output artifacts ---

export interface Citation {
  docId: string;
  locator?: string;
}

export interface UngroundableClaim {
  claimText: string;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

export interface GateItem {
  passed: boolean;
  detail: string;
}

export interface SynthesisGateResult {
  legalClearance: GateItem;
  strategicUplift: GateItem;
  citationVerification: GateItem;
  binaryDecisionPoint: GateItem;
  /** true iff all four pass */
  passed: boolean;
}

export interface OutputArtifact {
  taskId: string;
  step: OutputStep;
  /** prepended to every output (Rule 14) */
  routingBlock: RoutingBlock;
  /** model-generated prose */
  body: string;
  citations: Citation[];
  ungroundable: UngroundableClaim[];
  /** Superseded/Draft docIds used */
  flaggedSources: string[];
  validation: ValidationResult;
  /** present for full briefs */
  gate?: SynthesisGateResult;
  status: "complete" | "failed" | "truncated";
  generatedAt: string;
}

// --- Running estimate + memory (Rule 17) ---

export interface RunningEstimate {
  billetBalance: string;
  fundingStatus: string;
  activeCcirAlerts: CcirAlert[];
  /** full revision history */
  revisions: RunningEstimateRevision[];
}

export interface RunningEstimateRevision {
  at: string;
  taskId: string;
  summary: string;
  billetBalance: string;
  fundingStatus: string;
}

export interface ResourceCollision {
  /** e.g. "Range Alpha", "Instructor SSgt Doe" */
  resource: string;
  conflictingTaskIds: string[];
  detail: string;
}

export interface TaskOutcome {
  taskId: string;
  billetDelta?: string;
  fundingDelta?: string;
  allocatedResources: string[];
}

// --- CCIR (Rule 13) ---

export interface CcirAlert {
  category: CcirCategory;
  triggeringCondition: string;
  recommendedAction: string;
}

// --- AI + prompt assembly ---

export interface AssembledPrompt {
  step: OutputStep;
  /** encodes SAGE persona + hierarchy of truth + structural rules */
  system: string;
  /** routing block + requirement + constraints + assumptions + grounding */
  user: string;
}

export interface AiResult {
  ok: boolean;
  text?: string;
  errorMessage?: string;
  truncated: boolean;
}

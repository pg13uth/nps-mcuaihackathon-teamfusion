/**
 * Enumerations aligned to the SAGE Master Orchestration Directive (v10).
 * See design.md "Data Models" section.
 */

/** Rule 16: SAGE operational modes. */
export type OperationalMode = "Lite" | "Standard" | "FullStaff" | "CrisisAction";

/**
 * The directive's three echelons.
 * NOTE: reconciled to THREE values only (the earlier "Technical" value was removed).
 */
export type Tier = "Strategic" | "Operational" | "Tactical";

/** Rule 12: Core Operational Processes that drive SME routing. */
export type CoreProcess =
  | "ProgramObjectiveMemorandum"
  | "CampaignPlanning"
  | "CurriculumDevelopment"
  | "CapabilityAssessment"
  | "CrisisResponse"
  | "PolicyDevelopment";

/** Document lifecycle status used for grounding decisions (Requirement 10). */
export type DocStatus = "Active" | "Superseded" | "Draft";

/** Independently addressable staged-generation output steps. */
export type OutputStep =
  | "brief"
  | "storyboard"
  | "sitrep"
  | "cub"
  | "qpr"
  | "order"
  | "curriculum";

/** Rule 11: how SMEs are sequenced during execution. */
export type SmeSequenceKind = "parallel" | "sequential" | "handoff";

/**
 * SME organizational category.
 * NOTE: this is a category, separate and distinct from {@link Tier}.
 */
export type SmeCategory = "PrimaryAdvisor" | "SpecialStaff" | "TechnicalSme";

/** Rule 13: CCIR threshold categories. */
export type CcirCategory =
  | "PersonnelReadiness"
  | "ThreatOvermatch"
  | "LogisticsFailure"
  | "FiscalLaw";

/**
 * Rule 3: the SAGE Hierarchy of Truth conflict-resolution order.
 * Legality > Doctrine/Strategy > Feasibility > Human Dynamics.
 */
export type HierarchyOfTruth = ["Legality", "DoctrineStrategy", "Feasibility", "HumanDynamics"];

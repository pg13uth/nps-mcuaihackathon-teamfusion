/**
 * PromptAssembler — pure orchestration logic for staged prompt assembly
 * (Rules 3, 4, 6–10; Requirements 3.2, 3.3, 5.5, 6.2, 6.4, 8.3).
 *
 * `assemble` builds a single {@link AssembledPrompt} ({ step, system, user })
 * for one {@link OutputStep}. It is the deterministic bridge between the pure
 * orchestration layer and the AI client: no I/O, no randomness, no mutation of
 * inputs. Given the same inputs it always produces the same prompt strings.
 *
 * The two halves of the prompt have distinct responsibilities:
 *
 *  - **system prompt** encodes the *fixed doctrine* the model must obey:
 *      • the SAGE persona (senior civilian academic advisor / digital Chief of
 *        Staff to a 3-Star Commanding General);
 *      • the Hierarchy of Truth conflict-resolution order
 *        (Legality > Doctrine/Strategy > Feasibility > Human Dynamics, Rule 3);
 *      • the Strategic Uplift rule (Rule 4 — never dump raw lower-echelon data;
 *        elevate every fact to its enterprise-level impact);
 *      • the exact structural template for the requested step (Rules 6–10),
 *        whose section names/labels mirror what the downstream output
 *        validators parse for (so a compliant model output validates cleanly).
 *
 *  - **user prompt** carries the *task-specific* grounded inputs:
 *      • the routing block (PROCESS / TIER / SMEs TO TASK / MODE / SEQUENCE),
 *        prepended so it also heads the generated artifact (Rule 14);
 *      • the specific requirement text;
 *      • the resolved constraints and the explicit assumptions;
 *      • the grounding documents' text, each labeled with its `Doc_ID` so the
 *        model can produce bracketed `[Doc_ID]` citations that the
 *        CitationChecker can later verify.
 *
 * The concept of a per-SME "skill arsenal" (see `sme-arsenal/`) informs the
 * persona, but the prompt text here is deliberately self-contained: it does not
 * read any external skill files.
 */

import type {
  AssembledPrompt,
  Assumption,
  Constraints,
  CoreProcess,
  HierarchyOfTruth,
  OperationalMode,
  OutputStep,
  PromptAssembler as IPromptAssembler,
  RoutingBlock,
  SourceDocument,
} from "@sage/shared";

// ---------------------------------------------------------------------------
// Human-readable labels for enums (deterministic, no locale/formatting deps)
// ---------------------------------------------------------------------------

const PROCESS_LABELS: Record<CoreProcess, string> = {
  ProgramObjectiveMemorandum: "Program Objective Memorandum (POM)",
  CampaignPlanning: "Campaign Planning",
  CurriculumDevelopment: "Curriculum Development",
  CapabilityAssessment: "Capability Assessment",
  CrisisResponse: "Crisis Response",
  PolicyDevelopment: "Policy Development",
};

const MODE_LABELS: Record<OperationalMode, string> = {
  Lite: "Lite",
  Standard: "Standard",
  FullStaff: "Full Staff",
  CrisisAction: "Crisis Action",
};

/** Human-readable ordering of the Hierarchy of Truth for the system prompt. */
const HIERARCHY_LABELS: Record<string, string> = {
  Legality: "Legality",
  DoctrineStrategy: "Doctrine/Strategy",
  Feasibility: "Feasibility",
  HumanDynamics: "Human Dynamics",
};

// ---------------------------------------------------------------------------
// System-prompt building blocks
// ---------------------------------------------------------------------------

const SAGE_PERSONA = [
  "You are SAGE — the TECOM Strategic Academics Guru Executive.",
  "You act as a senior civilian academic advisor and the digital Chief of Staff",
  "to a 3-Star Commanding General (CG). You speak with executive concision,",
  "doctrinal precision, and enterprise perspective. You never fabricate data:",
  "any missing input is stated as an explicit assumption, and every factual",
  "claim is grounded in a provided source document and cited as [Doc_ID].",
].join(" ");

/** Render the Hierarchy of Truth clause (Rule 3). */
function hierarchyClause(hierarchy: HierarchyOfTruth): string {
  const ordered = hierarchy.map((h) => HIERARCHY_LABELS[h] ?? h).join(" > ");
  return [
    "HIERARCHY OF TRUTH (Rule 3): when analyses or source inputs conflict,",
    `resolve them strictly in this priority order: ${ordered}.`,
    "A higher-priority consideration always overrides a lower one; state which",
    "level governed any resolved conflict.",
  ].join(" ");
}

const STRATEGIC_UPLIFT = [
  "STRATEGIC UPLIFT (Rule 4): never dump raw lower-echelon or tactical data.",
  "Translate every lower-echelon fact into its enterprise-level impact —",
  "readiness, force design, resourcing, policy, and risk to the CG's mission.",
].join(" ");

const CITATION_DISCIPLINE = [
  "CITATION DISCIPLINE (Rules 5, 9): cite only from the GROUNDING DOCUMENTS",
  "supplied in the user message, using bracketed [Doc_ID] tags. If a claim",
  "cannot be grounded in a provided Active document, flag it explicitly rather",
  "than inventing a source, page number, or statistic.",
].join(" ");

// ---------------------------------------------------------------------------
// Per-step structural templates (Rules 6–10)
//
// Each template's headings/labels intentionally mirror the vocabulary the
// downstream output validators parse for, so a compliant response validates.
// ---------------------------------------------------------------------------

const STEP_TEMPLATES: Record<OutputStep, string> = {
  brief: [
    "OUTPUT: 3-Star Standard Executive Brief (Rule 6).",
    "Produce exactly these seven sections, in this order, each under its own heading:",
    "1. BLUF — 2–3 sentences beginning \"Sir/Ma'am, we must [Action]...\".",
    "2. Strategic Context",
    "3. Synthesized Analysis — a single unified narrative synthesizing all tasked SME inputs (Rule 3); do not pass through disjoint SME outputs.",
    "4. Assumptions & Limitations — restate every explicit assumption provided below.",
    "5. Risk Assessment",
    "6. Resource & Policy Implications — address the Holy Trinity (Manpower/T-O, Funding/POM, Facilities/MILCON-Ranges) and cite governing policy where applicable; apply Strategic Uplift to any lower-echelon data.",
    "7. Recommended Action — a clear, binary decision point (e.g. COA A vs COA B, or approve/disapprove).",
  ].join("\n"),

  storyboard: [
    "OUTPUT: 6-Slide UxS IPR Visual Storyboard blueprint (Rules 7 & 8).",
    "Produce exactly six slide blueprints, in this prescribed sequence:",
    "Slide 1: Agenda & BLUF; Slide 2: Strategic Context & Problem Frame;",
    "Slide 3: Framework; Slide 4: Resource Implications; Slide 5: Way Ahead;",
    "Slide 6: Decision Board.",
    "For EACH slide provide three labeled components: \"Visual Layout\",",
    "\"SAGE Text Constraint\", and \"Briefer's Script\".",
    "Respect per-slide word limits: Slide 1 bullets max 15 words each; Slide 3",
    "chevrons max 10 words each. Conform to the tiered visual rules and",
    "prohibitions for the specified TIER (Rule 8) — no raw spreadsheets,",
    "gradebooks, cell references, or individual student data on Strategic-tier visuals.",
  ].join("\n"),

  sitrep: [
    "OUTPUT: Daily SITREP (Rule 10). Produce EXACTLY five lines, in order, with",
    "no extra conversational text before, between, or after them:",
    "Overall; Last 24; Next 24; Issues; Coordination.",
    "Each line begins with its label.",
  ].join("\n"),

  cub: [
    "OUTPUT: Weekly CUB Quad-Board blueprint (Rule 10). Produce all four",
    "quadrants: LOEs (Lines of Effort); Performance Metrics (with a Red/Amber/Green",
    "RAG status rating); Accomplishments; Decisions Required.",
  ].join("\n"),

  qpr: [
    "OUTPUT: Quarterly Progress Report (QPR) — a data-driven dashboard blueprint.",
    "Analyze progress against Campaign Plan objectives (LOEs). Be data-driven:",
    "include quantitative signals such as percentages, metrics/KPIs, and",
    "on/behind/ahead-of-track status for each objective.",
  ].join("\n"),

  order: [
    "OUTPUT: Military Order — a FRAGO or staff action tasking (Rule / R8).",
    "Assign clear responsibilities (tasked unit / OPR / action officer) and",
    "explicit suspenses (NLT/due dates) for every tasked action. Where an",
    "associated brief exists, align the tasking with its Recommended Action.",
    "Follow military correspondence conventions (SECNAV M-5216.5): numbered",
    "paragraphs and/or Situation / Mission / Execution / Administration & Logistics /",
    "Command & Signal headings.",
  ].join("\n"),

  curriculum: [
    "OUTPUT: Curriculum Development Materials (Rules for curriculum).",
    "Provide TLOs/ELOs stated in Condition-Behavior-Standard (CBS) format",
    "(explicitly label the Condition, Behavior, and Standard). Provide",
    "Behaviorally Anchored Rating Scales (BARS) for assessment. Structure the",
    "lesson content using the 4C-ID (four-component instructional design)",
    "framework.",
  ].join("\n"),
};

/** Compose the full system prompt for a step. */
function buildSystemPrompt(step: OutputStep, hierarchy: HierarchyOfTruth): string {
  return [
    SAGE_PERSONA,
    "",
    hierarchyClause(hierarchy),
    "",
    STRATEGIC_UPLIFT,
    "",
    CITATION_DISCIPLINE,
    "",
    "STRUCTURAL TEMPLATE FOR THIS STEP:",
    STEP_TEMPLATES[step],
  ].join("\n");
}

// ---------------------------------------------------------------------------
// User-prompt building blocks
// ---------------------------------------------------------------------------

/** Render the routing block (Rule 14) as a labeled, machine-parseable header. */
function renderRoutingBlock(routing: RoutingBlock): string {
  const smes =
    routing.smesToTask.length > 0 ? routing.smesToTask.join(", ") : "(none)";
  const seqOrder =
    routing.sequence.order.length > 0 ? routing.sequence.order.join(" -> ") : "n/a";
  return [
    "ROUTING BLOCK",
    `PROCESS: ${PROCESS_LABELS[routing.process]}`,
    `TIER: ${routing.tier}`,
    `SMEs TO TASK: ${smes}`,
    `MODE: ${MODE_LABELS[routing.mode]}`,
    `SEQUENCE: ${routing.sequence.kind} (${seqOrder})`,
  ].join("\n");
}

/** Render resolved constraints; blanks are shown as explicit assumptions elsewhere. */
function renderConstraints(constraints: Constraints): string {
  const line = (label: string, value?: string): string =>
    `- ${label}: ${value && value.trim().length > 0 ? value.trim() : "(none provided — see assumptions)"}`;
  return [
    "RESOLVED CONSTRAINTS",
    line("Manpower/Billets", constraints.manpowerBillets),
    line("Funding/POM Cycle", constraints.fundingPomCycle),
    line("Facilities/Ranges", constraints.facilitiesRanges),
  ].join("\n");
}

/** Render the explicit assumptions list (Rule R1.3). */
function renderAssumptions(assumptions: Assumption[]): string {
  if (assumptions.length === 0) {
    return ["ASSUMPTIONS", "- (none)"].join("\n");
  }
  return [
    "ASSUMPTIONS",
    ...assumptions.map((a) => `- [${a.field}] ${a.text}`),
  ].join("\n");
}

/** Render grounding documents, each labeled with its Doc_ID for citation. */
function renderGrounding(grounding: SourceDocument[]): string {
  if (grounding.length === 0) {
    return [
      "GROUNDING DOCUMENTS",
      "- (none available — do not cite any source; flag any claim that would require one)",
    ].join("\n");
  }
  const blocks = grounding.map((doc) => {
    const status = doc.metadata?.Status ? ` | Status: ${doc.metadata.Status}` : "";
    const text =
      doc.extractedText && doc.extractedText.trim().length > 0
        ? doc.extractedText.trim()
        : "(no extracted text available)";
    return [`[${doc.docId}]${status}`, text].join("\n");
  });
  return ["GROUNDING DOCUMENTS", ...blocks].join("\n\n");
}

/** Compose the full user prompt. */
function buildUserPrompt(input: {
  routing: RoutingBlock;
  requirementText: string;
  resolvedConstraints: Constraints;
  assumptions: Assumption[];
  grounding: SourceDocument[];
}): string {
  const requirement = (input.requirementText ?? "").trim();
  return [
    renderRoutingBlock(input.routing),
    "",
    "REQUIREMENT",
    requirement.length > 0 ? requirement : "(no requirement text provided)",
    "",
    renderConstraints(input.resolvedConstraints),
    "",
    renderAssumptions(input.assumptions),
    "",
    renderGrounding(input.grounding),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public implementation
// ---------------------------------------------------------------------------

/**
 * Concrete PromptAssembler (Rules 3, 4, 6–10).
 * Pure and deterministic: same inputs -> byte-identical output.
 */
export class PromptAssemblerImpl implements IPromptAssembler {
  assemble(input: {
    step: OutputStep;
    routing: RoutingBlock;
    requirementText: string;
    resolvedConstraints: Constraints;
    assumptions: Assumption[];
    grounding: SourceDocument[];
    hierarchyOfTruth: HierarchyOfTruth;
  }): AssembledPrompt {
    const system = buildSystemPrompt(input.step, input.hierarchyOfTruth);
    const user = buildUserPrompt({
      routing: input.routing,
      requirementText: input.requirementText,
      resolvedConstraints: input.resolvedConstraints,
      assumptions: input.assumptions,
      grounding: input.grounding,
    });
    return { step: input.step, system, user };
  }
}

/** The canonical SAGE Hierarchy of Truth ordering (Rule 3). */
export const HIERARCHY_OF_TRUTH: HierarchyOfTruth = [
  "Legality",
  "DoctrineStrategy",
  "Feasibility",
  "HumanDynamics",
];

/** Convenience singleton for callers that don't need their own instance. */
export const promptAssembler: IPromptAssembler = new PromptAssemblerImpl();

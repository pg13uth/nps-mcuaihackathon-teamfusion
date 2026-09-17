/**
 * SmeSelector (pure orchestration).
 *
 * Rules 1, 2, 3, 11, 12 / Requirements 3.1, 3.3, 3.4, 2.3, 2.4.
 *
 * Selects the relevant SMEs from the 34-SME arsenal for a given
 * process / tier / mode and computes an execution {@link SmeSequence}
 * (parallel / sequential / handoff). The selection is a pure function of its
 * inputs — no I/O, no randomness — so identical inputs always yield an
 * identical result (deterministic), which the orchestration layer's
 * testability guarantees depend on.
 *
 * Behavior summary:
 *   - Process routing (Rule 12): each {@link CoreProcess} maps to a set of
 *     capability domains; SMEs whose `domains` intersect that set are
 *     process-relevant.
 *   - Tier filter (Rules 1, 2): process-relevant SMEs are preferred at the
 *     requested tier, but strategic Primary Advisors / Special Staff are always
 *     eligible because SAGE is an enterprise-level orchestrator.
 *   - Mode rules (Rule 16):
 *       Lite         -> exactly ONE SME (design Property 2)
 *       FullStaff    -> all PrimaryAdvisor + all SpecialStaff, plus any
 *                       process-relevant SMEs (design Property 3)
 *       CrisisAction -> a focused crisis cell: the SJA (Legality), the
 *                       process-relevant SMEs, and the threat SME
 *       Standard     -> a sensible mid subset: process-relevant SMEs plus the
 *                       SJA so Legality is always represented
 *   - Hierarchy of Truth ordering (Rule 3): the returned SMEs and the
 *     `sequence.order` are sorted by `hierarchyRank` ascending
 *     (1 = Legality, 2 = Doctrine/Strategy, 3 = Feasibility,
 *     4 = Human Dynamics), tie-broken by ascending `id`. Lower rank first means
 *     downstream conflict resolution is deterministic and Legality-first.
 *   - Sequence kind (Rule 11): chosen by mode/complexity —
 *       Lite         -> parallel (a single SME; nothing to sequence)
 *       Standard     -> parallel (SMEs work concurrently, then synthesized)
 *       FullStaff    -> sequential (staggered staffing across many domains)
 *       CrisisAction -> handoff (fast, ordered hand-offs down the priority chain)
 */

import {
  SME_ARSENAL,
  getSmesByCategory,
  type CoreProcess,
  type OperationalMode,
  type Sme,
  type SmeSelector,
  type SmeSequence,
  type SmeSequenceKind,
  type Tier,
} from "@sage/shared";

/**
 * Rule 12 — Core Operational Process -> capability domains that process needs.
 * An SME is "process-relevant" when any of its `domains` appears here. The
 * domain strings mirror the SME arsenal manifest exactly.
 */
const PROCESS_DOMAINS: Record<CoreProcess, readonly string[]> = {
  ProgramObjectiveMemorandum: [
    "POM",
    "Budget",
    "Finance",
    "Audit",
    "Manpower",
    "Logistics",
    "SupplyChain",
    "Materiel",
    "Maintenance",
    "Readiness",
  ],
  CampaignPlanning: [
    "Doctrine",
    "Policy",
    "Requirements",
    "ForceDesign",
    "ForceStructure",
    "Transition",
    "Timelines",
    "Operations",
    "BattleRhythm",
    "Intelligence",
    "Threat",
    "TTP",
  ],
  CurriculumDevelopment: [
    "Curriculum",
    "InstructionalDesign",
    "LearningScience",
    "Cognition",
    "Pedagogy",
    "POI",
    "Compliance",
    "MLF",
    "Assessment",
    "BARS",
    "Evaluation",
    "ScenarioDesign",
    "Facilitation",
    "EdTech",
    "LMS",
  ],
  CapabilityAssessment: [
    "Requirements",
    "ForceDesign",
    "Assessment",
    "Readiness",
    "Inspections",
    "Compliance",
    "Diagnostics",
    "DataAnalysis",
    "HumanPerformance",
    "Maintenance",
    "Equipment",
  ],
  CrisisResponse: [
    "Operations",
    "BattleRhythm",
    "Intelligence",
    "Threat",
    "TTP",
    "Readiness",
    "Logistics",
    "StrategicComms",
    "PublicAffairs",
  ],
  PolicyDevelopment: [
    "Policy",
    "Doctrine",
    "Correspondence",
    "StaffAction",
    "Legal",
    "Ethics",
    "FiscalLaw",
    "OrgChange",
    "HumanDynamics",
  ],
};

/** The Legal & Ethics Advisor (SJA) — Hierarchy-of-Truth rank 1 (Legality). */
const SJA_ID = 17;
/** The Threat & Adversary TTP Integration SME — key for crisis-action cells. */
const THREAT_SME_ID = 20;

/** Highest hierarchy rank used as a fallback when an SME omits `hierarchyRank`. */
const DEFAULT_HIERARCHY_RANK = 99;

function hierarchyRankOf(sme: Sme): number {
  return sme.hierarchyRank ?? DEFAULT_HIERARCHY_RANK;
}

/**
 * Deterministic Hierarchy-of-Truth ordering (Rule 3): ascending `hierarchyRank`
 * (Legality first), tie-broken by ascending `id`. Returns a new sorted array
 * and never mutates the input.
 */
function orderByHierarchyOfTruth(smes: readonly Sme[]): Sme[] {
  return [...smes].sort((a, b) => {
    const rankDelta = hierarchyRankOf(a) - hierarchyRankOf(b);
    if (rankDelta !== 0) return rankDelta;
    return a.id - b.id;
  });
}

/** True when an SME has at least one domain in the process's domain set. */
function isProcessRelevant(sme: Sme, process: CoreProcess): boolean {
  const domains = PROCESS_DOMAINS[process];
  return sme.domains.some((d) => domains.includes(d));
}

/** All process-relevant SMEs, in arsenal (id) order. */
function processRelevantSmes(process: CoreProcess): Sme[] {
  return SME_ARSENAL.filter((sme) => isProcessRelevant(sme, process));
}

/**
 * Rank a process-relevant SME for "most relevant" selection (Lite mode).
 * Preference order:
 *   1. matches the requested tier (closer to the caller's echelon)
 *   2. lower hierarchyRank (Legality first)
 *   3. more overlapping domains with the process
 *   4. lower id (stable, deterministic tie-break)
 */
function domainOverlapCount(sme: Sme, process: CoreProcess): number {
  const domains = PROCESS_DOMAINS[process];
  return sme.domains.filter((d) => domains.includes(d)).length;
}

/**
 * Pick the single most-relevant SME for Lite mode (design Property 2).
 * Falls back to the whole arsenal if the process somehow matches nothing, so a
 * single SME is always returned.
 */
function pickSingleSme(process: CoreProcess, tier: Tier): Sme {
  const candidates = processRelevantSmes(process);
  const pool = candidates.length > 0 ? candidates : [...SME_ARSENAL];

  return [...pool].sort((a, b) => {
    // 1. tier match first
    const aTier = a.tier === tier ? 0 : 1;
    const bTier = b.tier === tier ? 0 : 1;
    if (aTier !== bTier) return aTier - bTier;
    // 2. hierarchy rank (Legality first)
    const rankDelta = hierarchyRankOf(a) - hierarchyRankOf(b);
    if (rankDelta !== 0) return rankDelta;
    // 3. more domain overlap wins
    const overlapDelta =
      domainOverlapCount(b, process) - domainOverlapCount(a, process);
    if (overlapDelta !== 0) return overlapDelta;
    // 4. lower id, deterministic
    return a.id - b.id;
  })[0]!;
}

/** De-duplicate SMEs by id while preserving first-seen order. */
function uniqueById(smes: readonly Sme[]): Sme[] {
  const seen = new Set<number>();
  const out: Sme[] = [];
  for (const sme of smes) {
    if (!seen.has(sme.id)) {
      seen.add(sme.id);
      out.push(sme);
    }
  }
  return out;
}

/** Rule 11 — sequence kind chosen by mode/complexity. */
function sequenceKindForMode(mode: OperationalMode): SmeSequenceKind {
  switch (mode) {
    case "Lite":
      return "parallel"; // a single SME; nothing to sequence
    case "Standard":
      return "parallel"; // SMEs work concurrently, then synthesized
    case "FullStaff":
      return "sequential"; // staggered staffing across many domains
    case "CrisisAction":
      return "handoff"; // fast, ordered hand-offs down the priority chain
  }
}

/** Look up a single arsenal SME by id (guaranteed present for known ids). */
function smeById(id: number): Sme | undefined {
  return SME_ARSENAL.find((sme) => sme.id === id);
}

/**
 * Compute the selected SME set (unordered) for a given process/tier/mode.
 * Ordering by the Hierarchy of Truth is applied by the caller.
 */
function selectSmeSet(
  process: CoreProcess,
  tier: Tier,
  mode: OperationalMode,
): Sme[] {
  const relevant = processRelevantSmes(process);
  const sja = smeById(SJA_ID);

  switch (mode) {
    case "Lite":
      // Exactly one SME (design Property 2).
      return [pickSingleSme(process, tier)];

    case "FullStaff": {
      // All Primary Advisors + all Special Staff, plus process-relevant SMEs
      // (design Property 3). This guarantees at least one PrimaryAdvisor and at
      // least one SpecialStaff whenever the arsenal contains them.
      const primary = getSmesByCategory("PrimaryAdvisor");
      const special = getSmesByCategory("SpecialStaff");
      return uniqueById([...primary, ...special, ...relevant]);
    }

    case "CrisisAction": {
      // Focused crisis cell: Legality (SJA) + process-relevant SMEs + the
      // threat SME. Always includes the SJA so Legality leads the hand-off.
      const threat = smeById(THREAT_SME_ID);
      const members = [
        ...(sja ? [sja] : []),
        ...relevant,
        ...(threat ? [threat] : []),
      ];
      return uniqueById(members);
    }

    case "Standard":
    default: {
      // Sensible mid subset: process-relevant SMEs plus the SJA so Legality is
      // always represented for downstream conflict resolution.
      const members = [...(sja ? [sja] : []), ...relevant];
      // Guarantee non-empty even for an unforeseen empty relevant set.
      return uniqueById(members.length > 0 ? members : [...SME_ARSENAL]);
    }
  }
}

/**
 * Pure functional form of SME selection + sequencing. Deterministic given its
 * inputs. Returns the selected SMEs (ordered by the Hierarchy of Truth) and a
 * matching {@link SmeSequence} whose `order` is the selected SME ids in the
 * same Hierarchy-of-Truth order.
 */
export function selectSmes(input: {
  process: CoreProcess;
  tier: Tier;
  mode: OperationalMode;
}): { smes: Sme[]; sequence: SmeSequence } {
  const { process, tier, mode } = input;

  const selected = selectSmeSet(process, tier, mode);
  // Apply Hierarchy of Truth ordering metadata for downstream conflict
  // resolution (Rule 3): lower hierarchyRank first, tie-broken by id.
  const ordered = orderByHierarchyOfTruth(selected);

  const sequence: SmeSequence = {
    kind: sequenceKindForMode(mode),
    order: ordered.map((sme) => sme.id),
  };

  return { smes: ordered, sequence };
}

/**
 * Class implementation of the {@link SmeSelector} orchestration interface.
 * Delegates to the pure {@link selectSmes} function.
 */
export class DefaultSmeSelector implements SmeSelector {
  select(input: {
    process: CoreProcess;
    tier: Tier;
    mode: OperationalMode;
  }): { smes: Sme[]; sequence: SmeSequence } {
    return selectSmes(input);
  }
}

import type {
  CoreProcess,
  ModeRecommender,
  OperationalMode,
} from "@sage/shared";

/**
 * Rule 16 — Triage / Operational Mode selection.
 *
 * `ModeRecommender` produces a recommended {@link OperationalMode} from the
 * requirement text and selected {@link CoreProcess} when the user has not
 * chosen a mode (Requirement 2.2). The recommender is intentionally the *only*
 * concern here: it produces a recommendation and nothing more. Preservation of
 * an explicit user override (Requirement 2.1) is the responsibility of callers
 * — this function is never invoked when the user has already selected a mode.
 *
 * The heuristic is deterministic (pure function of its inputs, no I/O, no
 * randomness) so the same inputs always yield the same recommendation, which is
 * what the orchestration layer's testability guarantees depend on.
 *
 * Heuristic, in priority order:
 *   1. Crisis / urgent language, or the CrisisResponse process  -> CrisisAction
 *   2. Simple / quick single-domain questions                  -> Lite
 *   3. Complex multi-domain builds or capability assessments    -> FullStaff
 *   4. Everything else                                          -> Standard
 */

/** Words/phrases that signal a time-critical, crisis-driven request (Rule 16). */
const CRISIS_SIGNALS: readonly string[] = [
  "crisis",
  "urgent",
  "immediate",
  "immediately",
  "emergency",
  "flash",
  "asap",
  "right now",
  "time-sensitive",
  "time sensitive",
  "no-notice",
  "no notice",
  "casualty",
  "casualties",
  "breach",
  "imminent",
];

/** Words/phrases that signal a lightweight, single-answer request (Rule 16 Lite). */
const LITE_SIGNALS: readonly string[] = [
  "quick",
  "simple",
  "just",
  "brief question",
  "single",
  "what is",
  "what's",
  "define",
  "definition",
  "clarify",
  "lookup",
  "look up",
  "confirm",
  "fyi",
  "one question",
];

/** Words/phrases that signal a complex, multi-domain build (Rule 16 Full Staff). */
const FULL_STAFF_SIGNALS: readonly string[] = [
  "comprehensive",
  "full",
  "complete",
  "end-to-end",
  "end to end",
  "campaign",
  "roadmap",
  "strategy",
  "multi-domain",
  "multidomain",
  "enterprise",
  "program of record",
  "build out",
  "build-out",
  "storyboard",
  "brief and slides",
  "executive brief",
  "assess",
  "assessment",
  "analyze",
  "analysis",
  "evaluate",
];

/**
 * Processes that are inherently large, multi-domain builds and therefore lean
 * toward Full Staff mobilization when nothing else forces a different mode.
 */
const FULL_STAFF_PROCESSES: ReadonlySet<CoreProcess> = new Set<CoreProcess>([
  "CapabilityAssessment",
  "CampaignPlanning",
  "ProgramObjectiveMemorandum",
]);

/** Case-insensitive substring match against a list of signal phrases. */
function matchesAny(haystack: string, signals: readonly string[]): boolean {
  return signals.some((signal) => haystack.includes(signal));
}

/**
 * Rough single-domain heuristic: short requirements that reference at most one
 * capability domain read as lightweight. Length is a reasonable proxy in the
 * absence of NLP — a couple of short sentences rather than a multi-paragraph
 * tasking.
 */
function looksSingleDomain(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= 20;
}

export class HeuristicModeRecommender implements ModeRecommender {
  recommend(input: { requirementText: string; process: CoreProcess }): OperationalMode {
    return recommendMode(input);
  }
}

/**
 * Pure functional form of the recommendation heuristic. Deterministic given its
 * inputs.
 */
export function recommendMode(input: {
  requirementText: string;
  process: CoreProcess;
}): OperationalMode {
  const { requirementText, process } = input;
  const text = requirementText.toLowerCase();

  // 1. Crisis / urgent language, or an explicitly crisis-driven process, always
  //    wins — a time-critical request must not be down-graded to a lighter mode.
  if (process === "CrisisResponse" || matchesAny(text, CRISIS_SIGNALS)) {
    return "CrisisAction";
  }

  const looksComplex =
    matchesAny(text, FULL_STAFF_SIGNALS) || FULL_STAFF_PROCESSES.has(process);
  const looksLite = matchesAny(text, LITE_SIGNALS) || looksSingleDomain(text);

  // 2. A simple/quick single-domain query stays lightweight — but only when it
  //    does not also carry complexity signals (a "quick comprehensive campaign
  //    roadmap" is not Lite).
  if (looksLite && !looksComplex) {
    return "Lite";
  }

  // 3. Complex multi-domain builds and capability assessments mobilize the full
  //    staff.
  if (looksComplex) {
    return "FullStaff";
  }

  // 4. Everything else is the balanced default.
  return "Standard";
}

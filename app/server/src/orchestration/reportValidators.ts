import type { ValidationResult } from "@sage/shared";

/**
 * Battle-rhythm, orders, and curriculum output-structure validators.
 *
 * These are pure orchestration functions (no I/O, no mutation) that inspect the
 * model-generated prose for a given output step and return a deterministic
 * {@link ValidationResult} whose `violations` name every specific structural
 * failure. `valid` is `true` iff `violations` is empty.
 *
 * Scope (task 7.5): SITREP, CUB, QPR, Order (FRAGO/staff tasking), Curriculum.
 * The brief (`validateBrief`, task 7.1) and storyboard (`validateStoryboard`,
 * task 7.3) validators live in their own modules.
 *
 * Requirements covered:
 *  - 7.1 SITREP: exactly a 5-line report (Overall, Last 24, Next 24, Issues,
 *        Coordination) with no extra conversational text.
 *  - 7.2 CUB: Quad-Board blueprint (LOEs, Performance Metrics RAG,
 *        Accomplishments, Decisions Required).
 *  - 7.3 QPR: data-driven dashboard blueprint analyzing progress against
 *        Campaign Plan objectives.
 *  - 8.1/8.2/8.3 Order: FRAGO or staff action tasking with clear assigned
 *        responsibilities and suspenses, following military correspondence
 *        conventions (e.g. SECNAV M-5216.5 structure).
 *  - 9.1/9.2/9.3 Curriculum: TLOs/ELOs in Condition-Behavior-Standard format,
 *        Behaviorally Anchored Rating Scales (BARS), and 4C-ID structure.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Split text into trimmed, non-empty logical lines. */
function nonEmptyLines(text: string): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Build a ValidationResult from a violations list. */
function result(violations: string[]): ValidationResult {
  return { valid: violations.length === 0, violations };
}

/** Case-insensitive "does the whole text contain this pattern". */
function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text ?? "");
}

// ---------------------------------------------------------------------------
// SITREP (Requirement 7.1) — exactly a 5-line report
// ---------------------------------------------------------------------------

/**
 * The five prescribed SITREP lines, in order, each with the label regex used
 * to match the leading label of that line.
 */
const SITREP_LINES: { name: string; label: RegExp }[] = [
  { name: "Overall", label: /^overall\b/i },
  { name: "Last 24", label: /^last\s*24\b/i },
  { name: "Next 24", label: /^next\s*24\b/i },
  { name: "Issues", label: /^issues\b/i },
  { name: "Coordination", label: /^coordination\b/i },
];

/**
 * Validate a Daily SITREP (Requirement 7.1).
 *
 * A valid SITREP is EXACTLY five lines — Overall, Last 24, Next 24, Issues,
 * Coordination — in that order, with no extra conversational text before,
 * between, or after the five lines.
 */
export function validateSitrep(text: string): ValidationResult {
  const violations: string[] = [];
  const lines = nonEmptyLines(text);

  if (lines.length !== 5) {
    violations.push(
      `SITREP must be exactly 5 lines (Overall, Last 24, Next 24, Issues, Coordination); found ${lines.length}.`,
    );
  }

  // Validate whichever lines are present against the expected sequence so we
  // report precise per-line mismatches even when the count is wrong.
  const checkCount = Math.min(lines.length, SITREP_LINES.length);
  for (let i = 0; i < checkCount; i++) {
    const expected = SITREP_LINES[i]!;
    if (!expected.label.test(lines[i]!)) {
      violations.push(
        `SITREP line ${i + 1} must be the "${expected.name}" line; found "${lines[i]}".`,
      );
    }
  }

  // Any labeled lines that are missing entirely (when there are too few lines).
  for (let i = checkCount; i < SITREP_LINES.length; i++) {
    violations.push(`SITREP is missing the "${SITREP_LINES[i]!.name}" line.`);
  }

  return result(violations);
}

// ---------------------------------------------------------------------------
// CUB (Requirement 7.2) — Quad-Board blueprint
// ---------------------------------------------------------------------------

const CUB_QUADRANTS: { name: string; pattern: RegExp }[] = [
  { name: "LOEs (Lines of Effort)", pattern: /\b(?:loes?|lines?\s+of\s+effort)\b/i },
  {
    name: "Performance Metrics (RAG)",
    pattern: /\bperformance\s+metrics\b|\brag\b|\bred[\/\s-]*amber[\/\s-]*green\b/i,
  },
  { name: "Accomplishments", pattern: /\baccomplishments?\b/i },
  {
    name: "Decisions Required",
    pattern: /\bdecisions?\s+required\b|\bdecisions?\s+needed\b/i,
  },
];

/**
 * Validate a Weekly CUB (Commander's Update Brief) Quad-Board blueprint
 * (Requirement 7.2). All four quadrants must be present: LOEs, Performance
 * Metrics RAG, Accomplishments, Decisions Required.
 */
export function validateCub(text: string): ValidationResult {
  const violations: string[] = [];
  const body = text ?? "";

  for (const quad of CUB_QUADRANTS) {
    if (!has(body, quad.pattern)) {
      violations.push(`CUB Quad-Board is missing the "${quad.name}" quadrant.`);
    }
  }

  // A Quad-Board is a four-panel structure; require some RAG status signal so
  // the Performance Metrics quadrant is actually rated, not just named.
  const namesPerformance = has(body, /\bperformance\s+metrics\b/i);
  const hasRagSignal = has(
    body,
    /\b(?:rag|red|amber|green|yellow)\b/i,
  );
  if (namesPerformance && !hasRagSignal) {
    violations.push(
      'CUB Performance Metrics quadrant must carry a RAG (Red/Amber/Green) status rating.',
    );
  }

  return result(violations);
}

// ---------------------------------------------------------------------------
// QPR (Requirement 7.3) — data-driven dashboard blueprint
// ---------------------------------------------------------------------------

/**
 * Validate a Quarterly Progress Report (QPR) dashboard blueprint
 * (Requirement 7.3): a data-driven dashboard analyzing progress against
 * Campaign Plan objectives.
 */
export function validateQpr(text: string): ValidationResult {
  const violations: string[] = [];
  const body = text ?? "";

  if (!has(body, /\bqpr\b|\bquarterly\s+progress\b|\bdashboard\b/i)) {
    violations.push(
      'QPR must be a dashboard blueprint (missing "dashboard"/"QPR"/"Quarterly Progress" identifier).',
    );
  }

  if (!has(body, /\bcampaign\s+plan\b/i)) {
    violations.push(
      "QPR must analyze progress against Campaign Plan objectives (no Campaign Plan reference found).",
    );
  }

  if (!has(body, /\bobjectives?\b|\bloes?\b|\blines?\s+of\s+effort\b/i)) {
    violations.push(
      "QPR must reference the objectives (or LOEs) being measured against the Campaign Plan.",
    );
  }

  // "Data-driven" — require quantitative progress signal (a percentage, an
  // explicit metric/measure, or an on/behind/ahead-of-track status).
  const hasQuantitativeData =
    has(body, /\d+\s*%/) ||
    has(body, /\b(?:metric|measure|kpi|percent(?:age)?|trend)\b/i) ||
    has(body, /\b(?:on|behind|ahead\s+of)\s+track\b/i);
  if (!hasQuantitativeData) {
    violations.push(
      "QPR must be data-driven (no quantitative progress data such as %, metrics, or on/behind-track status found).",
    );
  }

  return result(violations);
}

// ---------------------------------------------------------------------------
// Order (Requirements 8.1, 8.2, 8.3) — FRAGO / staff action tasking
// ---------------------------------------------------------------------------

/**
 * Validate a military Order — a FRAGO or staff action tasking
 * (Requirements 8.1, 8.2, 8.3). It must:
 *  - identify itself as a FRAGO or staff tasking (8.1),
 *  - assign clear responsibilities with suspenses/deadlines (8.1),
 *  - follow military correspondence conventions, e.g. the SECNAV M-5216.5
 *    numbered-paragraph structure with Situation / Mission / Execution style
 *    headings (8.3).
 *
 * Alignment with an associated brief's recommended action (8.2) is a
 * cross-artifact concern handled during orchestration/assembly; this
 * structural validator confirms the tasking form itself.
 */
export function validateOrder(text: string): ValidationResult {
  const violations: string[] = [];
  const body = text ?? "";

  // 8.1 — the artifact must be a FRAGO or staff action tasking.
  if (
    !has(body, /\bfrago\b|\bfragmentary\s+order\b|\bstaff\s+(?:action|tasking)\b|\btasking\b/i)
  ) {
    violations.push(
      "Order must be a FRAGO or staff action tasking (no FRAGO/tasking identifier found).",
    );
  }

  // 8.1 — clear assigned responsibilities.
  if (
    !has(
      body,
      /\btasked?\b|\bresponsib(?:le|ilit(?:y|ies))\b|\bassigned\s+to\b|\baction\s+(?:officer|agent)\b|\bOPR\b/i,
    )
  ) {
    violations.push(
      "Order must assign clear responsibilities (no tasked unit/OPR/assigned-to found).",
    );
  }

  // 8.1 — suspenses (deadlines) for the tasked actions.
  if (!has(body, /\bsuspense\b|\bdue\s+(?:by|date|no\s+later\s+than)\b|\bNLT\b|\bdeadline\b/i)) {
    violations.push(
      "Order must specify suspenses/deadlines (no suspense/NLT/due-date found).",
    );
  }

  // 8.3 — military correspondence conventions (SECNAV M-5216.5 style):
  //   numbered paragraphs and/or the canonical Situation/Mission/Execution
  //   five-paragraph order headings.
  const hasNumberedParagraphs = has(body, /^\s*\d+\.\s+/m);
  const hasFiveParagraphHeadings = has(
    body,
    /\b(?:situation|mission|execution|administration(?:\s+and\s+logistics)?|command\s+and\s+signal|coordinating\s+instructions)\b/i,
  );
  if (!hasNumberedParagraphs && !hasFiveParagraphHeadings) {
    violations.push(
      "Order must follow military correspondence conventions (SECNAV M-5216.5): numbered paragraphs or Situation/Mission/Execution headings.",
    );
  }

  return result(violations);
}

// ---------------------------------------------------------------------------
// Curriculum (Requirements 9.1, 9.2, 9.3)
// ---------------------------------------------------------------------------

/**
 * Validate curriculum development materials (Requirements 9.1, 9.2, 9.3):
 *  - 9.1 TLOs/ELOs stated in Condition-Behavior-Standard (CBS) format,
 *  - 9.2 Behaviorally Anchored Rating Scales (BARS),
 *  - 9.3 content structured with the 4C-ID framework.
 */
export function validateCurriculum(text: string): ValidationResult {
  const violations: string[] = [];
  const body = text ?? "";

  // 9.1 — learning objectives present (TLOs and/or ELOs).
  const hasObjectives = has(
    body,
    /\btlos?\b|\belos?\b|\bterminal\s+learning\s+objective\b|\benabling\s+learning\s+objective\b/i,
  );
  if (!hasObjectives) {
    violations.push(
      "Curriculum must include learning objectives (TLOs/ELOs) — none found.",
    );
  }

  // 9.1 — objectives expressed in Condition-Behavior-Standard format.
  const hasCondition = has(body, /\bcondition\b/i);
  const hasBehavior = has(body, /\bbehavior\b/i);
  const hasStandard = has(body, /\bstandard\b/i);
  if (!(hasCondition && hasBehavior && hasStandard)) {
    const missing = [
      !hasCondition ? "Condition" : null,
      !hasBehavior ? "Behavior" : null,
      !hasStandard ? "Standard" : null,
    ].filter((m): m is string => m !== null);
    violations.push(
      `Curriculum objectives must use Condition-Behavior-Standard format (missing: ${missing.join(", ")}).`,
    );
  }

  // 9.2 — BARS assessment scale.
  if (!has(body, /\bbars\b|\bbehaviorally\s+anchored\s+rating\s+scale\b/i)) {
    violations.push(
      "Curriculum must include Behaviorally Anchored Rating Scales (BARS) — none found.",
    );
  }

  // 9.3 — 4C-ID structure (four components: learning tasks, supportive
  // information, procedural information, part-task practice).
  if (!has(body, /\b4c[-\s]?id\b|\bfour[-\s]?component\s+instructional\s+design\b/i)) {
    violations.push(
      "Curriculum must be structured using the 4C-ID framework — no 4C-ID reference found.",
    );
  }

  return result(violations);
}

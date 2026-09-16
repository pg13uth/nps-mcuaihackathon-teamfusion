import type {
  GateItem,
  SourceDocument,
  SynthesisGate,
  SynthesisGateResult,
} from "@sage/shared";

/**
 * SynthesisGate — Rule 15 QA pass run before a full brief is finalized.
 *
 * Requirements:
 *  - 11.1: run and report the four checks (Legal Clearance, Strategic Uplift,
 *          Citation Verification, Binary Decision Point).
 *  - 11.2: flag the specific failure for any check that does not pass.
 *
 * This is pure orchestration logic: it inspects the already-generated brief
 * text (plus the grounding documents that were injected) and returns a
 * deterministic verdict. It performs no I/O and does not mutate its inputs.
 *
 * `passed` is true if and only if all four individual checks pass
 * (design Property 12).
 *
 * ---------------------------------------------------------------------------
 * Heuristics (deterministic; documented so downstream reviewers understand
 * exactly what each check keys on). These operate on the brief prose because
 * the model-generated brief is the artifact the SAGE directive gates.
 *
 * 1. Legal Clearance
 *    A brief clears legally unless it carries an UNRESOLVED legal signal.
 *    We look for explicit "not-yet-cleared" markers such as
 *    "pending legal review", "legal review required/outstanding",
 *    "unresolved legal", "awaiting SJA", "legal: tbd", or a raised legal flag
 *    ("[LEGAL FLAG]"). If any unresolved marker is present the check fails and
 *    names the offending phrase. A brief with no legal mention, or one that
 *    states legal review is complete/cleared, passes.
 *
 * 2. Strategic Uplift (directive §4)
 *    SAGE reports to a 3-Star and must not dump raw lower-echelon data on the
 *    CG. The check fails when the brief contains raw-dump markers (e.g.
 *    "raw data", "raw SME output", "see attached spreadsheet", "instructor
 *    grading formula", tactical row/cell dumps) WITHOUT any enterprise-level
 *    framing. It passes when enterprise-level framing is present (e.g.
 *    "enterprise", "strategic", "Force Design", "3-Star", "campaign",
 *    "cognitive overmatch", "TECOM") and no un-elevated raw dump remains.
 *
 * 3. Citation Verification
 *    Every bracketed citation of the form [Doc_ID, ...] must resolve to a
 *    docId present in the supplied grounding set. Any citation token that does
 *    not match a grounding docId fails the check and is named. A brief with no
 *    citations passes this check (nothing to verify) — grounding sufficiency is
 *    a separate concern handled by the CitationChecker.
 *
 * 4. Binary Decision Point
 *    The Recommended Action must present a clear binary decision. The check
 *    passes when the brief contains a binary decision signal such as
 *    "COA A" and "COA B", an "approve / disapprove" (or "approve / defer")
 *    pairing, an "Option 1 vs Option 2" pairing, or an explicit
 *    "binary decision" phrase. Otherwise it fails.
 * ---------------------------------------------------------------------------
 */

/** Phrases that indicate legal review is still OPEN / not cleared. */
const UNRESOLVED_LEGAL_PATTERNS: RegExp[] = [
  /\bpending\s+legal\b/i,
  /\blegal\s+review\s+(?:required|outstanding|pending|incomplete)\b/i,
  /\bunresolved\s+legal\b/i,
  /\bawaiting\s+(?:sja|legal)\b/i,
  /\blegal\s*[:-]\s*(?:tbd|pending|open)\b/i,
  /\blegal\s+flag\b/i,
  /\[\s*legal\s+flag\s*\]/i,
];

/** Markers of un-elevated, lower-echelon "raw dump" content. */
const RAW_DUMP_PATTERNS: RegExp[] = [
  /\braw\s+(?:data|sme\s+output|dump|numbers?)\b/i,
  /\bsee\s+attached\s+spreadsheet\b/i,
  /\b(?:instructor\s+)?grading\s+formula\b/i,
  /\bcell\s+[A-Z]\d+\b/i,
  /\brow\s+\d+\s+(?:of|in)\s+the\b/i,
];

/** Markers that the analysis has been lifted to the enterprise/strategic level. */
const ENTERPRISE_FRAMING_PATTERNS: RegExp[] = [
  /\benterprise[-\s]?level\b/i,
  /\benterprise\b/i,
  /\bstrategic\b/i,
  /\bforce\s+design\b/i,
  /\b3[-\s]?star\b/i,
  /\bcampaign\b/i,
  /\bcognitive\s+overmatch\b/i,
  /\btecom\b/i,
];

/**
 * Matches bracketed citation groups like:
 *   [MCDP-7], [MCDP-7, p. 12], [DOC_A, DOC_B]
 * Captures the inner content for per-token parsing.
 */
const CITATION_GROUP = /\[([^\]]+)\]/g;

/** Binary decision-point signals. */
const BINARY_DECISION_PATTERNS: RegExp[] = [
  /\bcoa\s*a\b[\s\S]*\bcoa\s*b\b/i,
  /\bapprove\b[\s\S]*\b(?:disapprove|defer|reject|decline)\b/i,
  /\boption\s*1\b[\s\S]*\boption\s*2\b/i,
  /\bbinary\s+decision\b/i,
  /\bgo\b\s*(?:\/|or|vs\.?)\s*\bno[-\s]?go\b/i,
];

function matchFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m) return m[0];
  }
  return undefined;
}

function checkLegalClearance(briefText: string): GateItem {
  const offending = matchFirst(briefText, UNRESOLVED_LEGAL_PATTERNS);
  if (offending) {
    return {
      passed: false,
      detail: `Legal Clearance failed: unresolved legal signal present ("${offending.trim()}").`,
    };
  }
  return {
    passed: true,
    detail: "Legal Clearance: no unresolved legal flags detected.",
  };
}

function checkStrategicUplift(briefText: string): GateItem {
  const rawDump = matchFirst(briefText, RAW_DUMP_PATTERNS);
  const enterpriseFraming = matchFirst(briefText, ENTERPRISE_FRAMING_PATTERNS);

  if (rawDump && !enterpriseFraming) {
    return {
      passed: false,
      detail: `Strategic Uplift failed: raw lower-echelon content ("${rawDump.trim()}") not elevated to enterprise-level impact.`,
    };
  }
  if (!enterpriseFraming) {
    return {
      passed: false,
      detail:
        "Strategic Uplift failed: no enterprise-level framing detected (expected strategic/enterprise context per directive §4).",
    };
  }
  return {
    passed: true,
    detail: "Strategic Uplift: enterprise-level framing present.",
  };
}

function extractCitationTokens(briefText: string): string[] {
  const tokens: string[] = [];
  for (const group of briefText.matchAll(CITATION_GROUP)) {
    const inner = group[1] ?? "";
    for (const raw of inner.split(",")) {
      // Strip locator noise like "p. 12" / "pg 3" / "page 4"; keep the doc id.
      const token = raw.trim();
      if (token.length === 0) continue;
      if (/^(?:p\.?|pg\.?|page|para\.?|section|§)\s*\d+/i.test(token)) continue;
      if (/^\d+$/.test(token)) continue; // bare page numbers
      tokens.push(token);
    }
  }
  return tokens;
}

function checkCitationVerification(
  briefText: string,
  grounding: SourceDocument[],
): GateItem {
  const groundedIds = new Set(grounding.map((d) => d.docId));
  const tokens = extractCitationTokens(briefText);

  if (tokens.length === 0) {
    return {
      passed: true,
      detail: "Citation Verification: no bracketed citations to verify.",
    };
  }

  const unresolved = tokens.filter((t) => !groundedIds.has(t));
  if (unresolved.length > 0) {
    const unique = Array.from(new Set(unresolved));
    return {
      passed: false,
      detail: `Citation Verification failed: unresolved citation(s) not in grounding set — ${unique
        .map((u) => `[${u}]`)
        .join(", ")}.`,
    };
  }
  return {
    passed: true,
    detail: `Citation Verification: all ${tokens.length} citation(s) resolve against grounding documents.`,
  };
}

function checkBinaryDecisionPoint(briefText: string): GateItem {
  const signal = matchFirst(briefText, BINARY_DECISION_PATTERNS);
  if (!signal) {
    return {
      passed: false,
      detail:
        "Binary Decision Point failed: no clear binary recommended action detected (expected e.g. COA A vs COA B or approve/disapprove).",
    };
  }
  return {
    passed: true,
    detail: "Binary Decision Point: clear binary recommended action present.",
  };
}

/**
 * Concrete SynthesisGate implementation (Rule 15 / Requirements 11.1, 11.2).
 */
export class SynthesisGateImpl implements SynthesisGate {
  run(input: { briefText: string; grounding: SourceDocument[] }): SynthesisGateResult {
    const briefText = input.briefText ?? "";
    const grounding = input.grounding ?? [];

    const legalClearance = checkLegalClearance(briefText);
    const strategicUplift = checkStrategicUplift(briefText);
    const citationVerification = checkCitationVerification(briefText, grounding);
    const binaryDecisionPoint = checkBinaryDecisionPoint(briefText);

    const passed =
      legalClearance.passed &&
      strategicUplift.passed &&
      citationVerification.passed &&
      binaryDecisionPoint.passed;

    return {
      legalClearance,
      strategicUplift,
      citationVerification,
      binaryDecisionPoint,
      passed,
    };
  }
}

/** Convenience singleton for callers that don't need their own instance. */
export const synthesisGate: SynthesisGate = new SynthesisGateImpl();

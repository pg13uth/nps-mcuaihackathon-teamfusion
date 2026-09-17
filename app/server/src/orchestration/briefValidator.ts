/**
 * Brief validator — Rule 6 structural validation of the 3-Star Standard
 * executive brief (design Property 9).
 *
 * Requirements:
 *  - 5.1: the brief SHALL contain the seven sections in the prescribed order:
 *         BLUF, Strategic Context, Synthesized Analysis, Assumptions &
 *         Limitations, Risk Assessment, Resource & Policy Implications,
 *         Recommended Action.
 *  - 5.2: the BLUF SHALL be 2–3 sentences beginning with
 *         "Sir/Ma'am, we must [Action]...".
 *  - 5.3: the Resource & Policy Implications section SHALL address the
 *         "Holy Trinity" (Manpower/T-O, Funding/POM, Facilities/MILCON-Ranges).
 *  - 5.4: the Recommended Action SHALL present a clear, binary decision point.
 *
 * This is pure orchestration logic: it inspects the model-generated brief text
 * and returns a deterministic {@link ValidationResult}. It performs no I/O and
 * does not mutate its inputs. `valid` is true iff there are no violations.
 *
 * This module implements ONLY `validateBrief`. Other OutputValidator methods
 * (storyboard, sitrep, cub, qpr, order, curriculum) live in sibling modules and
 * are composed into a single OutputValidator elsewhere.
 */

import type { ValidationResult } from "@sage/shared";

/**
 * The seven Rule 6 sections in prescribed order. Each entry carries the
 * canonical label plus a matcher that recognizes the section heading in the
 * brief text. Headings are matched case-insensitively at the start of a line,
 * tolerating markdown heading markers ("#"), numbering ("1.", "1)"), and
 * trailing punctuation (":", "-").
 */
interface SectionSpec {
  /** Canonical name used in violation messages. */
  label: string;
  /** Recognizes the section heading (anchored per-line by the scanner). */
  heading: RegExp;
}

const SECTION_SPECS: readonly SectionSpec[] = [
  { label: "BLUF", heading: /\bBLUF\b/i },
  { label: "Strategic Context", heading: /\bStrategic\s+Context\b/i },
  { label: "Synthesized Analysis", heading: /\bSynthesized\s+Analysis\b/i },
  {
    label: "Assumptions & Limitations",
    heading: /\bAssumptions\s*(?:&|and)\s*Limitations\b/i,
  },
  { label: "Risk Assessment", heading: /\bRisk\s+Assessment\b/i },
  {
    label: "Resource & Policy Implications",
    heading: /\bResource\s*(?:&|and)\s*Policy\s+Implications\b/i,
  },
  { label: "Recommended Action", heading: /\bRecommended\s+Action\b/i },
];

/**
 * A line that looks like a section heading: optional leading markdown/number
 * decoration, then the heading text. We only treat a match as a heading if the
 * heading token appears near the start of the line (within the decoration),
 * which avoids matching an incidental mention of a section name inside prose.
 */
const HEADING_LINE_PREFIX = /^\s*(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(?:[-*]\s*)?/;

/** BLUF opening phrase: "Sir/Ma'am, we must [Action]..." (Requirement 5.2). */
const BLUF_OPENING = /^\s*Sir\s*\/\s*Ma'?am\s*,\s*we\s+must\s+\S+/i;

/** Holy Trinity components (Requirement 5.3). */
interface TrinitySpec {
  label: string;
  pattern: RegExp;
}

const HOLY_TRINITY: readonly TrinitySpec[] = [
  { label: "Manpower/T-O", pattern: /\b(?:manpower|billets?|t\/o|t-?o\b|table\s+of\s+organization)\b/i },
  { label: "Funding/POM", pattern: /\b(?:funding|pom|program\s+objective\s+memorandum|fiscal|budget)\b/i },
  {
    label: "Facilities/MILCON-Ranges",
    pattern: /\b(?:facilities|milcon|ranges?|infrastructure)\b/i,
  },
];

/** Binary decision-point signals in the Recommended Action (Requirement 5.4). */
const BINARY_DECISION_PATTERNS: readonly RegExp[] = [
  /\bcoa\s*a\b[\s\S]*\bcoa\s*b\b/i,
  /\bapprove\b[\s\S]*\b(?:disapprove|defer|reject|decline)\b/i,
  /\boption\s*1\b[\s\S]*\boption\s*2\b/i,
  /\bbinary\s+decision\b/i,
  /\bgo\b\s*(?:\/|or|vs\.?)\s*\bno[-\s]?go\b/i,
];

interface FoundSection {
  label: string;
  /** index of the specs entry */
  specIndex: number;
  /** line index where the heading was found */
  lineIndex: number;
}

/**
 * Locate section headings within the text, in the order they appear.
 * A section is only matched once (first occurrence), so a later prose mention
 * of an earlier section name does not create a spurious duplicate.
 */
function locateSections(lines: string[]): FoundSection[] {
  const found: FoundSection[] = [];
  const seen = new Set<number>();

  lines.forEach((line, lineIndex) => {
    const decoration = HEADING_LINE_PREFIX.exec(line)?.[0] ?? "";
    const afterDecoration = line.slice(decoration.length);

    for (let specIndex = 0; specIndex < SECTION_SPECS.length; specIndex++) {
      if (seen.has(specIndex)) continue;
      const spec = SECTION_SPECS[specIndex]!;
      // Heading must appear at the very start of the un-decorated line so that
      // "…discussed in the Risk Assessment section" (mid-sentence) is not a hit.
      const m = spec.heading.exec(afterDecoration);
      if (m && m.index === 0) {
        found.push({ label: spec.label, specIndex, lineIndex });
        seen.add(specIndex);
      }
    }
  });

  // Report in textual order of appearance.
  found.sort((a, b) => a.lineIndex - b.lineIndex);
  return found;
}

/** Extract the body text of a section given the located headings. */
function sectionBody(
  lines: string[],
  sections: FoundSection[],
  label: string,
): string | undefined {
  const idx = sections.findIndex((s) => s.label === label);
  if (idx === -1) return undefined;
  const start = sections[idx]!.lineIndex;
  // The section ends at the next heading (by textual position) or end-of-text.
  const nextLine = sections
    .map((s) => s.lineIndex)
    .filter((li) => li > start)
    .sort((a, b) => a - b)[0];
  const end = nextLine ?? lines.length;
  return lines.slice(start, end).join("\n");
}

/** Count sentences in the BLUF body (excluding the heading line itself). */
function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : text.trim().length > 0 ? 1 : 0;
}

/**
 * Validate an executive brief against Rule 6 (Requirements 5.1–5.4).
 *
 * Returns `{ valid, violations }`. `valid` is true iff `violations` is empty.
 * Each violation names the specific missing/out-of-order section or failed
 * check so callers can surface actionable feedback.
 */
export function validateBrief(text: string): ValidationResult {
  const violations: string[] = [];
  const source = text ?? "";
  const lines = source.split(/\r?\n/);

  const found = locateSections(lines);
  const foundLabels = new Set(found.map((f) => f.label));

  // --- Requirement 5.1a: all seven sections present ---
  for (const spec of SECTION_SPECS) {
    if (!foundLabels.has(spec.label)) {
      violations.push(`Missing required section: ${spec.label}`);
    }
  }

  // --- Requirement 5.1b: sections in the prescribed order ---
  // Compare the order of the sections that WERE found against their canonical
  // order. Any section appearing before one that should precede it is flagged.
  const foundSpecOrder = found.map((f) => f.specIndex);
  for (let i = 1; i < foundSpecOrder.length; i++) {
    if (foundSpecOrder[i]! < foundSpecOrder[i - 1]!) {
      const outOfPlace = SECTION_SPECS[foundSpecOrder[i]!]!.label;
      const precedingFound = SECTION_SPECS[foundSpecOrder[i - 1]!]!.label;
      violations.push(
        `Section out of order: "${outOfPlace}" appears after "${precedingFound}" (expected Rule 6 order).`,
      );
    }
  }

  // --- Requirement 5.2: BLUF phrasing (2–3 sentences, correct opening) ---
  const blufBody = sectionBody(lines, found, "BLUF");
  if (blufBody !== undefined) {
    // Strip the heading line to inspect the BLUF prose. The BLUF text may be on
    // the heading line (after a colon) or on the following lines.
    const blufLines = blufBody.split(/\r?\n/);
    const firstLine = blufLines[0] ?? "";
    const afterLabel = firstLine.replace(HEADING_LINE_PREFIX, "").replace(/^BLUF\s*[:.\-]?\s*/i, "");
    const blufText = [afterLabel, ...blufLines.slice(1)].join(" ").trim();

    if (!BLUF_OPENING.test(blufText)) {
      violations.push(
        'BLUF phrasing invalid: must begin with "Sir/Ma\'am, we must [Action]...".',
      );
    }
    const sentenceCount = countSentences(blufText);
    if (sentenceCount < 2 || sentenceCount > 3) {
      violations.push(
        `BLUF length invalid: expected 2–3 sentences, found ${sentenceCount}.`,
      );
    }
  }
  // (If BLUF is missing entirely, the missing-section violation above covers it.)

  // --- Requirement 5.3: Holy Trinity coverage in Resource & Policy Implications ---
  const resourceBody = sectionBody(lines, found, "Resource & Policy Implications");
  if (resourceBody !== undefined) {
    for (const component of HOLY_TRINITY) {
      if (!component.pattern.test(resourceBody)) {
        violations.push(
          `Resource & Policy Implications missing Holy Trinity component: ${component.label}.`,
        );
      }
    }
  }

  // --- Requirement 5.4: binary decision point in Recommended Action ---
  const actionBody = sectionBody(lines, found, "Recommended Action");
  if (actionBody !== undefined) {
    const hasBinary = BINARY_DECISION_PATTERNS.some((p) => p.test(actionBody));
    if (!hasBinary) {
      violations.push(
        "Recommended Action missing a clear binary decision point (e.g. COA A vs COA B or approve/disapprove).",
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Class wrapper exposing `validateBrief` so this module can be composed into a
 * single {@link OutputValidator} alongside the other validators. Only the brief
 * method is implemented here; the composed validator wires the rest.
 */
export class BriefValidator {
  validateBrief(text: string): ValidationResult {
    return validateBrief(text);
  }
}

/** Convenience singleton. */
export const briefValidator = new BriefValidator();

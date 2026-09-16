/**
 * Storyboard validator — pure orchestration logic for the 6-Slide UxS IPR
 * storyboard blueprint (Rules 7 & 8; Requirements 6.1, 6.2, 6.3, 6.4).
 *
 * `validateStoryboard` inspects the model-generated storyboard prose and
 * returns a {@link ValidationResult} naming every structural violation it
 * finds. It performs no I/O and does not mutate its inputs.
 *
 * Correctness properties enforced here:
 *  - Property 10 (Requirements 6.1, 6.3): the storyboard is valid only if it
 *    contains exactly six slide blueprints in the prescribed sequence and each
 *    slide respects its per-slide word constraint.
 *
 * Additional structural checks from Requirement 6:
 *  - 6.2: each slide blueprint specifies Visual Layout, SAGE Text Constraint,
 *    and Briefer's Script.
 *  - 6.4: tiered visual framework rules/prohibitions (Rule 8) are enforced
 *    where determinable from the blueprint text.
 *
 * ---------------------------------------------------------------------------
 * Expected storyboard shape (deterministic parse target)
 *
 * The validator recognizes six slides delimited by a heading line that names
 * the slide number and/or its title, e.g.:
 *
 *   Slide 1: Agenda & BLUF
 *   - Visual Layout: ...
 *   - SAGE Text Constraint: ...
 *   - Briefer's Script: ...
 *
 * Slide headings may use "Slide N", "Slide N:", "#N", or a bare enumerated
 * title; the prescribed titles are matched case-insensitively and tolerate
 * minor punctuation/whitespace differences. Each of the three components is a
 * labeled line/section: "Visual Layout", "SAGE Text Constraint" (or
 * "Text Constraint"), and "Briefer's Script" (or "Briefer Script").
 * ---------------------------------------------------------------------------
 */

import type { SourceDocument, Tier, ValidationResult } from "@sage/shared";

/** The prescribed six-slide sequence (Requirement 6.1). */
export const PRESCRIBED_SLIDES: readonly {
  /** 1-based slide position */
  index: number;
  /** canonical title */
  title: string;
  /** case-insensitive matchers for the title (any match identifies the slide) */
  titlePatterns: RegExp[];
}[] = [
  {
    index: 1,
    title: "Agenda & BLUF",
    titlePatterns: [/\bagenda\b/i, /\bbluf\b/i],
  },
  {
    index: 2,
    title: "Strategic Context & Problem Frame",
    titlePatterns: [/\bstrategic\s+context\b/i, /\bproblem\s+frame\b/i],
  },
  {
    index: 3,
    title: "Framework",
    titlePatterns: [/\bframework\b/i],
  },
  {
    index: 4,
    title: "Resource Implications",
    titlePatterns: [/\bresource\s+implications?\b/i],
  },
  {
    index: 5,
    title: "Way Ahead",
    titlePatterns: [/\bway\s+ahead\b/i],
  },
  {
    index: 6,
    title: "Decision Board",
    titlePatterns: [/\bdecision\s+board\b/i],
  },
];

/** Number of required slide blueprints. */
export const REQUIRED_SLIDE_COUNT = PRESCRIBED_SLIDES.length;

/** Per-slide word limits from Requirement 6.3. */
const SLIDE1_MAX_WORDS_PER_BULLET = 15;
const SLIDE3_MAX_WORDS_PER_CHEVRON = 10;

/** A parsed slide block extracted from the storyboard text. */
interface ParsedSlide {
  /** 1-based ordinal in the document (position order, not prescribed index) */
  ordinal: number;
  /** the heading line text (without the leading marker) */
  heading: string;
  /** full block body text (lines after the heading, up to the next slide) */
  body: string;
  /** raw lines of the block body */
  bodyLines: string[];
}

/** Matches a slide heading line, capturing an optional number and the title. */
const SLIDE_HEADING = /^\s*(?:#+\s*)?slide\s*#?\s*(\d+)?\s*[:.)-]?\s*(.*)$/i;

/**
 * Split the storyboard text into slide blocks. A new block starts at each line
 * that matches {@link SLIDE_HEADING}. Text before the first heading is ignored.
 */
function parseSlides(text: string): ParsedSlide[] {
  const lines = text.split(/\r?\n/);
  const slides: ParsedSlide[] = [];
  let current: { heading: string; bodyLines: string[] } | undefined;

  for (const line of lines) {
    const m = SLIDE_HEADING.exec(line);
    if (m) {
      if (current) {
        slides.push(finalizeSlide(slides.length + 1, current));
      }
      // The title is whatever follows the "Slide N" marker on the heading line.
      current = { heading: (m[2] ?? "").trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) {
    slides.push(finalizeSlide(slides.length + 1, current));
  }
  return slides;
}

function finalizeSlide(
  ordinal: number,
  raw: { heading: string; bodyLines: string[] },
): ParsedSlide {
  return {
    ordinal,
    heading: raw.heading,
    body: raw.bodyLines.join("\n"),
    bodyLines: raw.bodyLines,
  };
}

/** Case-insensitively test whether a slide's heading matches a prescribed slide. */
function headingMatchesPrescribed(
  heading: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((p) => p.test(heading));
}

/** Locate the labeled value for a component (Visual Layout / Text Constraint / Script). */
function componentPresent(block: string, labelPatterns: RegExp[]): boolean {
  return labelPatterns.some((p) => p.test(block));
}

const VISUAL_LAYOUT_LABELS = [/\bvisual\s+layout\b/i];
const TEXT_CONSTRAINT_LABELS = [/\bsage\s+text\s+constraint\b/i, /\btext\s+constraint\b/i];
const BRIEFERS_SCRIPT_LABELS = [/\bbriefer'?s?\s+script\b/i];

/** Count words in a string (whitespace-delimited, ignoring empty tokens). */
function wordCount(s: string): number {
  const tokens = s.trim().split(/\s+/).filter((t) => t.length > 0);
  return tokens.length;
}

/**
 * Extract the "content" lines that fall under a given labeled component within
 * a slide body. Returns the text on the label line after the colon plus any
 * subsequent indented/bulleted lines until the next recognized label.
 */
function extractComponentBody(bodyLines: string[], labelPatterns: RegExp[]): string[] {
  const ALL_LABELS = [
    ...VISUAL_LAYOUT_LABELS,
    ...TEXT_CONSTRAINT_LABELS,
    ...BRIEFERS_SCRIPT_LABELS,
  ];
  const out: string[] = [];
  let capturing = false;
  for (const line of bodyLines) {
    const isThisLabel = labelPatterns.some((p) => p.test(line));
    const isAnyLabel = ALL_LABELS.some((p) => p.test(line));
    if (isThisLabel) {
      capturing = true;
      // capture inline value after the label (e.g. "Visual Layout: three bullets")
      const afterColon = line.replace(/^.*?:/, "").trim();
      if (afterColon.length > 0) {
        out.push(afterColon);
      }
      continue;
    }
    if (capturing) {
      if (isAnyLabel) {
        break; // reached the next component
      }
      out.push(line);
    }
  }
  return out;
}

/** Split a component body into discrete bullet/line items. */
function bulletItems(componentLines: string[]): string[] {
  const items: string[] = [];
  for (const line of componentLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // strip leading bullet markers: -, *, •, >, chevron arrows, numbering
    const cleaned = trimmed.replace(/^(?:[-*•>]+|\d+[.)]|»|›|→|=>|>>)\s*/, "").trim();
    if (cleaned.length > 0) {
      items.push(cleaned);
    }
  }
  return items;
}

/**
 * Tiered visual prohibitions (Rule 8), enforced where determinable from text.
 * These are conservative textual checks: they only fire when the blueprint
 * explicitly names a prohibited visual element for the given tier.
 *
 * - Strategic tier: executive read-ahead visuals must stay at the enterprise
 *   level. Explicit tactical/granular artifacts (raw spreadsheets, gradebooks,
 *   cell-level tables, individual grading formulae) are prohibited.
 * - Tactical tier: strategic-only enterprise dashboards are not the intended
 *   product; but this is advisory and not enforced as a hard failure here.
 */
const STRATEGIC_VISUAL_PROHIBITIONS: { pattern: RegExp; label: string }[] = [
  { pattern: /\braw\s+spreadsheet\b/i, label: "raw spreadsheet" },
  { pattern: /\bgrade\s?book\b/i, label: "gradebook" },
  { pattern: /\bcell\s+[A-Z]\d+\b/i, label: "spreadsheet cell reference" },
  { pattern: /\bgrading\s+formula\b/i, label: "grading formula" },
  { pattern: /\bindividual\s+student\s+(?:names?|grades?|scores?)\b/i, label: "individual student data" },
];

function checkTieredVisualRules(slide: ParsedSlide, tier: Tier | undefined, violations: string[]): void {
  if (tier !== "Strategic") return;
  for (const prohibition of STRATEGIC_VISUAL_PROHIBITIONS) {
    if (prohibition.pattern.test(slide.body)) {
      violations.push(
        `Slide ${slide.ordinal}: prohibited visual for Strategic tier (Rule 8): ${prohibition.label}.`,
      );
    }
  }
}

/**
 * Validate a 6-slide UxS IPR storyboard blueprint.
 *
 * @param text the model-generated storyboard prose.
 * @param options optional context:
 *   - `tier`: when provided, enables tiered visual rule/prohibition checks
 *     (Requirement 6.4 / Rule 8) where determinable from the text.
 *   - `grounding`: accepted for interface symmetry with other validators; not
 *     required for structural validation.
 * @returns a {@link ValidationResult} whose `violations` name each specific
 *   problem (wrong slide count, out-of-sequence, missing component, or
 *   word-limit exceedance).
 */
export function validateStoryboard(
  text: string,
  options?: { tier?: Tier; grounding?: SourceDocument[] },
): ValidationResult {
  const violations: string[] = [];
  const tier = options?.tier;

  const slides = parseSlides(text ?? "");

  // --- Slide count (Requirement 6.1 / Property 10) ---
  if (slides.length !== REQUIRED_SLIDE_COUNT) {
    violations.push(
      `Expected exactly ${REQUIRED_SLIDE_COUNT} slide blueprints, found ${slides.length}.`,
    );
  }

  // --- Sequence + per-slide checks ---
  // Validate each position we can against the prescribed sequence.
  const positionsToCheck = Math.min(slides.length, REQUIRED_SLIDE_COUNT);
  for (let i = 0; i < positionsToCheck; i++) {
    const slide = slides[i];
    const prescribed = PRESCRIBED_SLIDES[i];

    // Sequence (Requirement 6.1): slide at position i must match prescribed title.
    if (!headingMatchesPrescribed(slide.heading, prescribed.titlePatterns)) {
      violations.push(
        `Slide ${i + 1} out of sequence: expected "${prescribed.title}", found "${slide.heading || "(untitled)"}".`,
      );
    }

    // Required components (Requirement 6.2).
    if (!componentPresent(slide.body, VISUAL_LAYOUT_LABELS)) {
      violations.push(`Slide ${i + 1} ("${prescribed.title}"): missing Visual Layout.`);
    }
    if (!componentPresent(slide.body, TEXT_CONSTRAINT_LABELS)) {
      violations.push(`Slide ${i + 1} ("${prescribed.title}"): missing SAGE Text Constraint.`);
    }
    if (!componentPresent(slide.body, BRIEFERS_SCRIPT_LABELS)) {
      violations.push(`Slide ${i + 1} ("${prescribed.title}"): missing Briefer's Script.`);
    }

    // Per-slide word limits (Requirement 6.3).
    if (prescribed.index === 1) {
      const bullets = bulletItems(
        extractComponentBody(slide.bodyLines, TEXT_CONSTRAINT_LABELS),
      );
      for (const bullet of bullets) {
        const wc = wordCount(bullet);
        if (wc > SLIDE1_MAX_WORDS_PER_BULLET) {
          violations.push(
            `Slide 1 ("${prescribed.title}"): bullet exceeds ${SLIDE1_MAX_WORDS_PER_BULLET}-word limit (${wc} words): "${bullet}".`,
          );
        }
      }
    }
    if (prescribed.index === 3) {
      const chevrons = bulletItems(
        extractComponentBody(slide.bodyLines, TEXT_CONSTRAINT_LABELS),
      );
      for (const chevron of chevrons) {
        const wc = wordCount(chevron);
        if (wc > SLIDE3_MAX_WORDS_PER_CHEVRON) {
          violations.push(
            `Slide 3 ("${prescribed.title}"): chevron exceeds ${SLIDE3_MAX_WORDS_PER_CHEVRON}-word limit (${wc} words): "${chevron}".`,
          );
        }
      }
    }

    // Tiered visual rules/prohibitions (Requirement 6.4 / Rule 8).
    checkTieredVisualRules(slide, tier, violations);
  }

  return { valid: violations.length === 0, violations };
}

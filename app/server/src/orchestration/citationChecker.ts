/**
 * CitationChecker — pure orchestration logic for grounded citations (Rules 5, 9).
 *
 * Verifies every bracketed `[Doc_ID, ...]` citation found in generated output
 * against the supplied grounding documents:
 *  - a citation whose docId maps to an **Active** grounding document is
 *    recorded in `verified` (preserving any locator such as "p. 12");
 *  - a citation whose docId is not an Active grounding document is recorded as
 *    an `UngroundableClaim` — it is FLAGGED, never silently accepted and never
 *    backfilled with an invented source or page number (Requirement 10.6).
 *
 * Design correctness property enforced here:
 *  - Property 7: for every bracketed citation in the text, the citation is
 *    either verified (against an Active grounding doc) or recorded as an
 *    ungroundable claim — exclusively one or the other.
 *
 * This module is independent of the SynthesisGate. It mirrors that module's
 * bracket-parsing approach (strip locator noise like "p. 12", ignore bare page
 * numbers) but keeps its own parsing so the two can evolve separately.
 *
 * The module performs no I/O and does not mutate its inputs.
 */

import type {
  Citation,
  CitationChecker as ICitationChecker,
  SourceDocument,
  UngroundableClaim,
} from "@sage/shared";

/**
 * Matches bracketed citation groups like:
 *   [MCDP-7], [MCDP-7, p. 12], [DOC_A, DOC_B]
 * Captures the inner content for per-token parsing.
 */
const CITATION_GROUP = /\[([^\]]+)\]/g;

/** Locator/noise tokens (page/paragraph/section references) that are not doc ids. */
const LOCATOR_PATTERN = /^(?:p\.?|pp\.?|pg\.?|page|para\.?|paragraph|section|sec\.?|§)\s*\d+/i;

/** A bare number token (e.g. a page number left dangling in the brackets). */
const BARE_NUMBER_PATTERN = /^\d+$/;

/** One parsed citation token: the doc id plus any locator noise seen alongside it. */
interface ParsedCitation {
  docId: string;
  /** the raw bracket group, e.g. "MCDP-7, p. 12" — used as claim text on failure */
  rawGroup: string;
  /** the locator string within the group, if any (e.g. "p. 12") */
  locator?: string;
}

/**
 * Parse all bracketed citation groups from `text` into {@link ParsedCitation}
 * records. Within a group, the first non-locator, non-bare-number token is the
 * doc id; a recognized locator token (if present) is captured as the locator.
 * Groups that contain no usable doc id are skipped (nothing to verify).
 */
function parseCitations(text: string): ParsedCitation[] {
  const parsed: ParsedCitation[] = [];

  for (const group of text.matchAll(CITATION_GROUP)) {
    const rawGroup = (group[1] ?? "").trim();
    if (rawGroup.length === 0) continue;

    let docId: string | undefined;
    let locator: string | undefined;

    for (const part of rawGroup.split(",")) {
      const token = part.trim();
      if (token.length === 0) continue;

      if (LOCATOR_PATTERN.test(token)) {
        // First locator wins; keep the doc id/locator pairing intuitive.
        if (locator === undefined) locator = token;
        continue;
      }
      if (BARE_NUMBER_PATTERN.test(token)) {
        continue; // bare page number, not a doc id
      }
      if (docId === undefined) {
        docId = token;
      }
    }

    if (docId === undefined) continue; // no groundable doc id in this group
    parsed.push({ docId, rawGroup, locator });
  }

  return parsed;
}

/** Build the set of docIds that are present in grounding AND tagged Active. */
function activeGroundingIds(grounding: SourceDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of grounding) {
    if (doc.metadata?.Status === "Active") {
      ids.add(doc.docId);
    }
  }
  return ids;
}

/**
 * Concrete CitationChecker implementation (Rules 5, 9 / Requirements 10.5, 10.6).
 */
export class CitationCheckerImpl implements ICitationChecker {
  check(
    text: string,
    grounding: SourceDocument[],
  ): {
    verified: Citation[];
    ungroundable: UngroundableClaim[];
  } {
    const source = text ?? "";
    const docs = grounding ?? [];
    const activeIds = activeGroundingIds(docs);

    const verified: Citation[] = [];
    const ungroundable: UngroundableClaim[] = [];

    for (const citation of parseCitations(source)) {
      if (activeIds.has(citation.docId)) {
        const entry: Citation = { docId: citation.docId };
        if (citation.locator !== undefined) {
          entry.locator = citation.locator;
        }
        verified.push(entry);
      } else {
        // Flag, never invent: the docId is not backed by an Active grounding doc.
        ungroundable.push({
          claimText: `[${citation.rawGroup}]`,
          reason: `Citation "${citation.docId}" does not map to an Active grounding document.`,
        });
      }
    }

    return { verified, ungroundable };
  }
}

/** Convenience singleton for callers that don't need their own instance. */
export const citationChecker: ICitationChecker = new CitationCheckerImpl();

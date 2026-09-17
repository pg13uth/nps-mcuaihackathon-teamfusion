/**
 * GroundingFilter — pure orchestration logic for document grounding (Rules 5, 9, 10).
 *
 * Partitions candidate source documents into:
 *  - `grounding`: fully-tagged documents that may ground generated output.
 *  - `excluded`: documents missing any of the five required metadata keys, or
 *    (for Strategic-tier steps) documents that fail echelon compartmentalization.
 *  - `flaggedSources`: grounding documents tagged `Superseded` or `Draft` — still
 *    usable, but their use must be flagged explicitly (Requirement 10.7).
 *
 * Design correctness properties enforced here:
 *  - Property 5: a document is in `grounding` iff it has all five metadata keys.
 *  - Property 6: for a Strategic-tier step, no document whose only echelon tag is
 *    `Tactical` appears in `grounding`.
 *  - Property 8: every grounding document tagged Superseded/Draft appears in
 *    `flaggedSources`.
 *
 * This module performs no I/O and is total for valid typed inputs.
 */

import type { GroundingFilter as IGroundingFilter } from "@sage/shared";
import type { DocumentMetadata, SourceDocument, Tier } from "@sage/shared";

/** The five metadata keys required for a document to be usable as grounding. */
const REQUIRED_METADATA_KEYS: readonly (keyof DocumentMetadata)[] = [
  "Echelon",
  "Domain",
  "Doc_Type",
  "Status",
  "Topic_Tags",
];

/** A non-empty string once trimmed. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * True iff the document carries all five required metadata keys with meaningful
 * (non-blank / non-empty) values. `Topic_Tags` must be a non-empty array of
 * non-blank strings; scalar keys must be non-blank strings.
 */
export function hasAllFiveKeys(doc: SourceDocument): boolean {
  const meta = doc.metadata;
  if (!meta) {
    return false;
  }
  for (const key of REQUIRED_METADATA_KEYS) {
    const value = meta[key];
    if (key === "Topic_Tags") {
      if (!Array.isArray(value) || value.length === 0 || !value.every(isNonEmptyString)) {
        return false;
      }
    } else if (!isNonEmptyString(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Parse the `Echelon` metadata value into a set of echelon tags. The value may
 * hold one or multiple echelons separated by commas, semicolons, slashes, or
 * pipes (e.g. "Strategic, Operational"). Tags are compared case-insensitively
 * against the {@link Tier} vocabulary.
 */
function echelonTags(doc: SourceDocument): Set<Tier> {
  const raw = doc.metadata?.Echelon ?? "";
  const tags = new Set<Tier>();
  for (const part of raw.split(/[,;/|]/)) {
    const normalized = part.trim().toLowerCase();
    if (normalized === "strategic") {
      tags.add("Strategic");
    } else if (normalized === "operational") {
      tags.add("Operational");
    } else if (normalized === "tactical") {
      tags.add("Tactical");
    }
  }
  return tags;
}

/**
 * Property 6 helper: a document is compartmentalized out of a Strategic-tier
 * grounding set iff its only recognized echelon tag is `Tactical`.
 */
function isTacticalOnly(doc: SourceDocument): boolean {
  const tags = echelonTags(doc);
  return tags.size === 1 && tags.has("Tactical");
}

export class GroundingFilterImpl implements IGroundingFilter {
  filter(
    docs: SourceDocument[],
    tier?: Tier,
  ): {
    grounding: SourceDocument[];
    excluded: SourceDocument[];
    flaggedSources: SourceDocument[];
  } {
    const grounding: SourceDocument[] = [];
    const excluded: SourceDocument[] = [];
    const flaggedSources: SourceDocument[] = [];

    for (const doc of docs) {
      // Property 5: missing any required key -> excluded, never grounding.
      if (!hasAllFiveKeys(doc)) {
        excluded.push(doc);
        continue;
      }

      // Property 6: Strategic-tier steps exclude Tactical-only documents.
      if (tier === "Strategic" && isTacticalOnly(doc)) {
        excluded.push(doc);
        continue;
      }

      grounding.push(doc);

      // Property 8: Superseded/Draft grounding docs are usable but flagged.
      const status = doc.metadata?.Status;
      if (status === "Superseded" || status === "Draft") {
        flaggedSources.push(doc);
      }
    }

    return { grounding, excluded, flaggedSources };
  }
}

/** Default singleton instance for convenient wiring. */
export const groundingFilter: IGroundingFilter = new GroundingFilterImpl();

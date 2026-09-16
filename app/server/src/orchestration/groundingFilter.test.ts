import { describe, it, expect } from "vitest";
import type { DocumentMetadata, SourceDocument } from "@sage/shared";
import { GroundingFilterImpl, hasAllFiveKeys } from "./groundingFilter.js";

/**
 * Unit tests for GroundingFilter (task 5.1).
 * Property-based tests (5.2/5.3/5.4) are implemented separately.
 */

const filter = new GroundingFilterImpl();

function meta(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    Echelon: "Strategic",
    Domain: "Legal",
    Doc_Type: "Policy",
    Status: "Active",
    Topic_Tags: ["policy"],
    ...overrides,
  };
}

function doc(docId: string, metadata?: DocumentMetadata): SourceDocument {
  return { docId, s3Key: `key/${docId}`, fileType: "docx", metadata };
}

describe("GroundingFilter — fully-tagged documents (Property 5, R10.3/10.4)", () => {
  it("keeps a fully-tagged Active document in grounding and not flagged", () => {
    const d = doc("D1", meta());
    const result = filter.filter([d]);
    expect(result.grounding).toEqual([d]);
    expect(result.excluded).toEqual([]);
    expect(result.flaggedSources).toEqual([]);
  });

  it("excludes a document with no metadata at all", () => {
    const d = doc("D2");
    const result = filter.filter([d]);
    expect(result.grounding).toEqual([]);
    expect(result.excluded).toEqual([d]);
  });

  it.each(["Echelon", "Domain", "Doc_Type", "Status"] as const)(
    "excludes a document missing the %s key",
    (missingKey) => {
      const m = meta();
      // Blank out one required scalar key.
      (m as unknown as Record<string, unknown>)[missingKey] = "";
      const d = doc("D3", m);
      const result = filter.filter([d]);
      expect(result.grounding).toEqual([]);
      expect(result.excluded).toEqual([d]);
    },
  );

  it("excludes a document with empty Topic_Tags", () => {
    const d = doc("D4", meta({ Topic_Tags: [] }));
    const result = filter.filter([d]);
    expect(result.excluded).toEqual([d]);
    expect(result.grounding).toEqual([]);
  });

  it("grounding and excluded are disjoint", () => {
    const good = doc("G", meta());
    const bad = doc("B");
    const result = filter.filter([good, bad]);
    const groundingIds = new Set(result.grounding.map((x) => x.docId));
    const excludedIds = new Set(result.excluded.map((x) => x.docId));
    for (const id of groundingIds) {
      expect(excludedIds.has(id)).toBe(false);
    }
  });
});

describe("GroundingFilter — Superseded/Draft flagging (Property 8, R10.7)", () => {
  it("flags a Superseded document while keeping it usable", () => {
    const d = doc("S1", meta({ Status: "Superseded" }));
    const result = filter.filter([d]);
    expect(result.grounding).toContain(d);
    expect(result.flaggedSources).toContain(d);
  });

  it("flags a Draft document while keeping it usable", () => {
    const d = doc("DR1", meta({ Status: "Draft" }));
    const result = filter.filter([d]);
    expect(result.grounding).toContain(d);
    expect(result.flaggedSources).toContain(d);
  });

  it("does not flag Active documents", () => {
    const d = doc("A1", meta({ Status: "Active" }));
    const result = filter.filter([d]);
    expect(result.flaggedSources).toEqual([]);
  });
});

describe("GroundingFilter — echelon compartmentalization (Property 6, R10.3)", () => {
  it("excludes a Tactical-only doc from a Strategic-tier grounding set", () => {
    const d = doc("T1", meta({ Echelon: "Tactical" }));
    const result = filter.filter([d], "Strategic");
    expect(result.grounding).toEqual([]);
    expect(result.excluded).toEqual([d]);
  });

  it("keeps a Tactical-only doc when no tier / non-Strategic tier is given", () => {
    const d = doc("T2", meta({ Echelon: "Tactical" }));
    expect(filter.filter([d]).grounding).toContain(d);
    expect(filter.filter([d], "Tactical").grounding).toContain(d);
    expect(filter.filter([d], "Operational").grounding).toContain(d);
  });

  it("keeps a multi-echelon doc (Tactical + Strategic) for a Strategic step", () => {
    const d = doc("M1", meta({ Echelon: "Tactical, Strategic" }));
    const result = filter.filter([d], "Strategic");
    expect(result.grounding).toContain(d);
  });

  it("keeps a Strategic doc for a Strategic step", () => {
    const d = doc("SG1", meta({ Echelon: "Strategic" }));
    expect(filter.filter([d], "Strategic").grounding).toContain(d);
  });
});

describe("hasAllFiveKeys", () => {
  it("returns true for a complete metadata block", () => {
    expect(hasAllFiveKeys(doc("X", meta()))).toBe(true);
  });
  it("returns false when metadata is absent", () => {
    expect(hasAllFiveKeys(doc("Y"))).toBe(false);
  });
});

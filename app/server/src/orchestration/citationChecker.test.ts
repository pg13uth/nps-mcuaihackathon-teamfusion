import { describe, it, expect } from "vitest";
import type { DocStatus, DocumentMetadata, SourceDocument } from "@sage/shared";
import { CitationCheckerImpl } from "./citationChecker.js";

/**
 * Unit tests for CitationChecker (task 5.5).
 * The property-based test (5.6, Property 7) is implemented separately.
 */

const checker = new CitationCheckerImpl();

function meta(status: DocStatus = "Active"): DocumentMetadata {
  return {
    Echelon: "Strategic",
    Domain: "Legal",
    Doc_Type: "Policy",
    Status: status,
    Topic_Tags: ["policy"],
  };
}

function doc(docId: string, status: DocStatus = "Active"): SourceDocument {
  return { docId, s3Key: `key/${docId}`, fileType: "docx", metadata: meta(status) };
}

describe("CitationChecker (Rules 5,9 / R10.5, R10.6)", () => {
  it("verifies a citation that maps to an Active grounding document", () => {
    const grounding = [doc("MCDP-7")];
    const result = checker.check("Per policy [MCDP-7], we must act.", grounding);

    expect(result.verified).toEqual([{ docId: "MCDP-7" }]);
    expect(result.ungroundable).toEqual([]);
  });

  it("flags a citation to an unknown docId as ungroundable (never invented)", () => {
    const grounding = [doc("MCDP-7")];
    const result = checker.check("Analysis [MADE-UP-DOC] shows risk.", grounding);

    expect(result.verified).toEqual([]);
    expect(result.ungroundable).toHaveLength(1);
    expect(result.ungroundable[0].claimText).toBe("[MADE-UP-DOC]");
    expect(result.ungroundable[0].reason).toContain("MADE-UP-DOC");
  });

  it("flags a citation to a non-Active (Superseded/Draft) grounding doc as ungroundable", () => {
    const grounding = [doc("OLD-DOC", "Superseded"), doc("DRAFT-DOC", "Draft")];
    const result = checker.check(
      "See [OLD-DOC] and [DRAFT-DOC] for background.",
      grounding,
    );

    expect(result.verified).toEqual([]);
    expect(result.ungroundable).toHaveLength(2);
    expect(result.ungroundable.map((u) => u.claimText)).toEqual([
      "[OLD-DOC]",
      "[DRAFT-DOC]",
    ]);
  });

  it("strips page/locator noise but preserves it on the verified citation", () => {
    const grounding = [doc("MCDP-7")];
    const result = checker.check("Per [MCDP-7, p. 12] the funding is capped.", grounding);

    expect(result.verified).toEqual([{ docId: "MCDP-7", locator: "p. 12" }]);
    expect(result.ungroundable).toEqual([]);
  });

  it("returns empty results when there are no bracketed citations", () => {
    const result = checker.check("No citations here at all.", [doc("MCDP-7")]);
    expect(result.verified).toEqual([]);
    expect(result.ungroundable).toEqual([]);
  });

  it("partitions each citation as exactly verified xor ungroundable (Property 7)", () => {
    const grounding = [doc("A"), doc("B", "Draft")];
    const result = checker.check("[A] then [B] then [C].", grounding);

    expect(result.verified).toEqual([{ docId: "A" }]);
    expect(result.ungroundable.map((u) => u.claimText)).toEqual(["[B]", "[C]"]);
  });
});

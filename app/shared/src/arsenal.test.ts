import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  SME_ARSENAL,
  SME_COUNT,
  getSmeById,
  getSmesByIds,
  getSmesByTier,
  getSmesByCategory,
} from "./arsenal.js";
import type { SmeCategory, Tier } from "./index.js";

const VALID_TIERS: Tier[] = ["Strategic", "Operational", "Tactical"];
const VALID_CATEGORIES: SmeCategory[] = [
  "PrimaryAdvisor",
  "SpecialStaff",
  "TechnicalSme",
];

describe("SME arsenal data (task 1.2)", () => {
  it("contains exactly 34 SMEs", () => {
    expect(SME_ARSENAL).toHaveLength(34);
    expect(SME_COUNT).toBe(34);
  });

  it("has unique ids covering exactly 1..34", () => {
    const ids = SME_ARSENAL.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(34);
    expect([...unique].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 34 }, (_, i) => i + 1),
    );
  });

  it("uses only the three valid tier values", () => {
    for (const sme of SME_ARSENAL) {
      expect(VALID_TIERS).toContain(sme.tier);
    }
  });

  it("uses only the three valid category values", () => {
    for (const sme of SME_ARSENAL) {
      expect(VALID_CATEGORIES).toContain(sme.category);
    }
  });

  it("matches the manifest tier partitions (Strategic 1-21, Operational 22-28, Tactical 29-34)", () => {
    for (const sme of SME_ARSENAL) {
      if (sme.id >= 1 && sme.id <= 21) expect(sme.tier).toBe("Strategic");
      else if (sme.id >= 22 && sme.id <= 28) expect(sme.tier).toBe("Operational");
      else expect(sme.tier).toBe("Tactical");
    }
  });

  it("gives every SME a non-empty name and at least one domain", () => {
    for (const sme of SME_ARSENAL) {
      expect(sme.name.length).toBeGreaterThan(0);
      expect(sme.domains.length).toBeGreaterThan(0);
    }
  });

  it("includes primary advisors and special staff (Full Staff composition, R2.4)", () => {
    expect(getSmesByCategory("PrimaryAdvisor").length).toBeGreaterThan(0);
    expect(getSmesByCategory("SpecialStaff").length).toBeGreaterThan(0);
  });
});

describe("SME arsenal lookup helpers", () => {
  it("getSmeById returns the correct SME for a known id", () => {
    const sja = getSmeById(17);
    expect(sja).toBeDefined();
    expect(sja?.name).toBe("Legal & Ethics Advisor (SJA)");
    expect(sja?.category).toBe("SpecialStaff");
    expect(sja?.hierarchyRank).toBe(1);
  });

  it("getSmeById returns undefined for the orchestrator (0) and out-of-range ids", () => {
    expect(getSmeById(0)).toBeUndefined();
    expect(getSmeById(35)).toBeUndefined();
    expect(getSmeById(-1)).toBeUndefined();
  });

  it("getSmesByIds resolves ids in order and skips unknown ids", () => {
    const smes = getSmesByIds([29, 0, 1, 99]);
    expect(smes.map((s) => s.id)).toEqual([29, 1]);
  });

  it("getSmesByTier returns the manifest partition sizes", () => {
    expect(getSmesByTier("Strategic")).toHaveLength(21);
    expect(getSmesByTier("Operational")).toHaveLength(7);
    expect(getSmesByTier("Tactical")).toHaveLength(6);
  });

  it("property: getSmeById round-trips for every arsenal member", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SME_ARSENAL.map((s) => s.id)), (id) => {
        const sme = getSmeById(id);
        return sme !== undefined && sme.id === id;
      }),
    );
  });

  it("property: getSmeById is undefined for any id outside 1..34", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 1 || n > 34),
        (id) => getSmeById(id) === undefined,
      ),
    );
  });
});

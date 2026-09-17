# SAGE SME Arsenal — Portable Skill Library

This directory preserves the behavior of the SAGE 34-agent SME architecture as portable
markdown "skills." Each skill file pairs machine-readable routing metadata (YAML
front-matter) with grounded behavioral prose, so the definitions can be:

- consumed by this application's deterministic `SmeSelector` / `RoutingBlockBuilder`
  (via `manifest.json`), and
- referenced directly by future GenAI.mil models and capabilities (the `.md` body is
  injectable verbatim as a system-prompt fragment).

## Provenance

All behavioral content is grounded in:

> `SAGE_Master_Orchestration_Directive_(Version_10_-_Final).docx`,
> Section 2 "The SME Arsenal & Delegation Matrix"
> (S3: `s3://20260916-5103-mcuhackathon-team-fusion/Agents/SAGE/`).

No expertise, references, or roles were invented. Where the directive is ambiguous, the
ambiguity is documented below rather than resolved by fabrication.

## Structure

```
sme-arsenal/
  README.md              # this file
  manifest.json          # SAGE + 33 sub-agents: id, name, tier, group, category, domains
  skills/
    00-sage-orchestrator.md
    tier1-strategic/      # 21 skills
    tier2-operational/    #  7 skills
    tier3-tactical/       #  6 skills
```

## Skill file format

Each skill uses YAML front-matter for routing + a prose body for behavior:

```markdown
---
id: 16
name: Legal & Ethics Advisor (SJA)
tier: Strategic
group: Special Staff
category: SpecialStaff
domains: [Legal, Ethics, FiscalLaw]
hierarchyRank: 1
source: "SAGE Master Orchestration Directive v10 §2"
---

# Legal & Ethics Advisor (SJA)
## Role & Mandate
## Analytical Lens
## Governing References
## Hierarchy of Truth Position
## When SAGE Should Task This SME
```

`hierarchyRank` encodes the Conflict Resolution Protocol (§3 "Hierarchy of Truth"):
1 = Legality, 2 = Doctrine/Strategy, 3 = Feasibility, 4 = Human Dynamics.

## Documented source discrepancies

1. **Count reconciled to 34.** §1 states a "34-agent SME architecture (consisting of
   yourself and 34 specialized sub-agents, representing 35 active AI personas)." §2 names
   exactly **34** sub-agents (Tier 1 = 21, Tier 2 = 7, Tier 3 = 6), so SAGE + 34 = 35
   personas as claimed. (An earlier draft miscounted Tier 1 as 20; the Academic Strategy &
   Enterprise Policy group actually contains 7 SMEs, and Special Staff contains 5.) No SME
   was invented and none omitted.

2. **3 tiers vs. 4 in `design.md`.** The directive defines **3** echelons
   (Strategic / Operational / Tactical). The application's `design.md` schema defines a
   `Tier` enum with **4** values (adds `Technical`). Skill files match the directive (3
   tiers). The `design.md` enum should be reconciled — either drop `Technical` or define an
   explicit mapping — before implementation.

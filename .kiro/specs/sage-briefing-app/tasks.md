# Implementation Plan: SAGE Briefing Application

## Overview

This plan builds the SAGE Briefing Application incrementally: shared TypeScript types first, then the pure orchestration core (where the bulk of correctness lives and where property-based tests P1–P16 apply), then the side-effecting adapters (AI, S3, extraction, persistence) behind interfaces, then the Express routes that wire orchestration to adapters, and finally the React frontend. Each step builds on prior steps and ends by wiring new code into the running app so there is no orphaned code. Property tests are placed immediately after the pure functions they validate to catch errors early.

## Tasks

- [x] 1. Set up project structure, shared types, and testing framework
  - [x] 1.1 Scaffold the monorepo and shared domain types
    - Create a TypeScript project with `client/` (React) and `server/` (Node/Express) plus a shared types module importable by both
    - Define all enumerations and interfaces from the design Data Models section: `OperationalMode`, `Tier`, `CoreProcess`, `DocStatus`, `OutputStep`, `Sme`, `SmeSequence`, `Constraints`, `Assumption`, `Task`, `RoutingBlock`, `DocumentMetadata`, `SourceDocument`, `Citation`, `UngroundableClaim`, `ValidationResult`, `SynthesisGateResult`, `GateItem`, `OutputArtifact`, `RunningEstimate`, `RunningEstimateRevision`, `ResourceCollision`, `TaskOutcome`, `CcirCategory`, `CcirAlert`, `AssembledPrompt`, `AiResult`, `HierarchyOfTruth`, `AppConfig`
    - Define the orchestration and adapter interfaces (`ModeRecommender`, `SmeSelector`, `RoutingBlockBuilder`, `ConstraintResolver`, `GroundingFilter`, `PromptAssembler`, `OutputValidator`, `SynthesisGate`, `CitationChecker`, `CcirEngine`, `RunningEstimateService`, `AiClient`, `S3DocumentAdapter`, `TextExtractor`, `Repository`)
    - Set up the test runner and a property-based testing library (fast-check)
    - _Requirements: 1.1, 1.2, 4.1_

  - [x] 1.2 Define the 34-SME arsenal data
    - Encode the 34 SMEs as typed data with `id` (1..34), `name`, `tier`, `domains`, and `category` (`PrimaryAdvisor` / `SpecialStaff` / `TechnicalSme`)
    - Provide a lookup helper used by the SME selector
    - _Requirements: 3.1, 2.4_

- [x] 2. Implement intake, constraint resolution, and triage (pure orchestration)
  - [x] 2.1 Implement ConstraintResolver
    - Convert blank/undefined constraint fields into explicit `Assumption` records; never fabricate a resolved value for a blank field
    - _Requirements: 1.3_

  - [ ]* 2.2 Write property test for ConstraintResolver
    - **Property 4: Blank constraints become assumptions, never invented values**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Implement ModeRecommender
    - Recommend an `OperationalMode` from requirement text + `CoreProcess` when the user selects none; allow user override to be preserved
    - _Requirements: 2.2, 2.1_

  - [ ]* 2.4 Write unit tests for ModeRecommender
    - Assert sensible mode recommendations for representative requirement phrasings and processes
    - _Requirements: 2.2_

- [x] 3. Implement SME selection, sequencing, and routing block (pure orchestration)
  - [x] 3.1 Implement SmeSelector
    - Select SMEs from the 34-SME arsenal by process/tier/mode; compute `SmeSequence` (parallel/sequential/handoff); Lite yields exactly one SME; Full Staff mobilizes primary advisors + special staff
    - Apply Hierarchy of Truth ordering metadata for downstream conflict resolution (Legality > Doctrine/Strategy > Feasibility > Human Dynamics)
    - _Requirements: 3.1, 3.3, 3.4, 2.3, 2.4_

  - [ ]* 3.2 Write property test for Lite mode SME count
    - **Property 2: Lite mode tasks exactly one SME**
    - **Validates: Requirements 2.3**

  - [ ]* 3.3 Write property test for Full Staff SME composition
    - **Property 3: Full Staff mode mobilizes primary advisors and special staff**
    - **Validates: Requirements 2.4**

  - [x] 3.4 Implement RoutingBlockBuilder
    - Emit PROCESS / TIER / SMEs TO TASK / MODE / SEQUENCE; `smesToTask` lists the specific mobilized SME ids; Lite may omit brief-only fields but still identifies the tasked SME
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 3.5 Write property test for routing block SME identification
    - **Property 1: Routing block always identifies the tasked SMEs**
    - **Validates: Requirements 4.1, 4.2, 3.1**

  - [ ]* 3.6 Write unit test for routing block format
    - Assert the exact PROCESS/TIER/SMEs/MODE/SEQUENCE layout expected by downstream parsing
    - _Requirements: 4.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement document grounding and citation checking (pure orchestration)
  - [x] 5.1 Implement GroundingFilter
    - Keep only fully-tagged documents (all five metadata keys) in `grounding`; place documents missing any key in `excluded`; mark `Superseded`/`Draft` docs for explicit flagging; enforce echelon compartmentalization for Strategic-tier steps
    - _Requirements: 10.3, 10.4, 10.7_

  - [ ]* 5.2 Write property test for grounding tagging
    - **Property 5: Grounding uses only fully-tagged documents**
    - **Validates: Requirements 10.3, 10.4**

  - [ ]* 5.3 Write property test for echelon compartmentalization
    - **Property 6: Echelon compartmentalization is enforced**
    - **Validates: Requirements 10.3**

  - [ ]* 5.4 Write property test for Superseded/Draft flagging
    - **Property 8: Superseded/Draft sources are always flagged when used**
    - **Validates: Requirements 10.7**

  - [x] 5.5 Implement CitationChecker
    - Verify each bracketed `[Doc_ID, ...]` citation against an Active grounding document or record it as an `UngroundableClaim`; never invent a source or page number
    - _Requirements: 10.5, 10.6_

  - [ ]* 5.6 Write property test for citation grounding
    - **Property 7: Every citation is grounded or flagged**
    - **Validates: Requirements 10.5, 10.6**

- [x] 6. Implement staged prompt assembly (pure orchestration)
  - [x] 6.1 Implement PromptAssembler
    - Build one prompt per `OutputStep`; system prompt encodes SAGE persona, Hierarchy of Truth, Strategic Uplift, and the exact structural template for the requested step (Rules 6–10); user prompt carries routing block, requirement, resolved constraints, assumptions, and injected grounding text with `Doc_ID`s
    - _Requirements: 3.2, 3.3, 5.5, 6.2, 6.4, 8.3_

  - [ ]* 6.2 Write unit tests for PromptAssembler
    - Assert each step produces a prompt containing the routing block, grounding doc ids, and step-specific structural instructions
    - _Requirements: 3.2, 5.5_

- [x] 7. Implement output structure validators (pure orchestration)
  - [x] 7.1 Implement brief validator
    - Validate the seven Rule 6 sections in prescribed order (BLUF, Strategic Context, Synthesized Analysis, Assumptions & Limitations, Risk Assessment, Resource & Policy Implications, Recommended Action); check BLUF phrasing and binary decision point; check Holy Trinity coverage in Resource & Policy Implications
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.2 Write property test for brief structure
    - **Property 9: Brief structure is complete and ordered**
    - **Validates: Requirements 5.1, 5.2, 5.4**

  - [x] 7.3 Implement storyboard validator
    - Validate exactly six slide blueprints in the prescribed sequence, each specifying Visual Layout, SAGE Text Constraint, and Briefer's Script, and respecting per-slide word limits; enforce tiered visual rules/prohibitions
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.4 Write property test for storyboard structure
    - **Property 10: Storyboard is exactly six slides within word limits**
    - **Validates: Requirements 6.1, 6.3**

  - [x] 7.5 Implement battle rhythm and orders/curriculum validators
    - Validate SITREP (5-line report), CUB Quad-Board blueprint, QPR dashboard blueprint, FRAGO/staff tasking (assigned responsibilities + suspenses, correspondence conventions), and curriculum artifacts (TLOs/ELOs in Condition-Behavior-Standard, BARS, 4C-ID)
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

  - [ ]* 7.6 Write property test for SITREP structure
    - **Property 11: SITREP is exactly five mapped lines**
    - **Validates: Requirements 7.1**

  - [ ]* 7.7 Write unit tests for report/order/curriculum validators
    - Canonical good and bad outputs for CUB, QPR, FRAGO/tasking, and curriculum artifacts
    - _Requirements: 7.2, 7.3, 8.1, 9.1, 9.2, 9.3_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Synthesis Gate, CCIR engine, and running estimate (pure orchestration)
  - [x] 9.1 Implement SynthesisGate
    - Run the four QA checks (Legal Clearance, Strategic Uplift, Citation Verification, Binary Decision Point); `passed` true iff all four pass; flag specific failures
    - _Requirements: 11.1, 11.2_

  - [ ]* 9.2 Write property test for Synthesis Gate
    - **Property 12: Synthesis Gate passes iff all four checks pass**
    - **Validates: Requirements 11.1, 11.2**

  - [x] 9.3 Implement CcirEngine
    - Evaluate thresholds (personnel readiness, threat overmatch, logistics failure, fiscal law); emit alerts with triggering condition and recommended action
    - _Requirements: 13.1, 13.2_

  - [ ]* 9.4 Write property test for CCIR alerting
    - **Property 15: CCIR alerts fire exactly at thresholds**
    - **Validates: Requirements 13.1, 13.2**

  - [x] 9.5 Implement RunningEstimateService
    - Update the estimate, append exactly one revision, and detect downstream resource collisions naming the conflicting resource
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 9.6 Write property test for collision detection
    - **Property 13: Running estimate collisions are detected**
    - **Validates: Requirements 12.2**

  - [ ]* 9.7 Write property test for append-only revision history
    - **Property 14: Running estimate revision history is append-only**
    - **Validates: Requirements 12.1, 12.3**

- [x] 10. Implement side-effecting adapters
  - [x] 10.1 Implement AiClient (OpenAI-compatible)
    - Read endpoint/model/credentials from config; call `chat/completions`; return typed `AiResult` with `ok`, `text`, `errorMessage`, `truncated`; never throw into orchestration; never echo secrets in errors
    - _Requirements: 14.1, 14.2, 14.3, 15.2_

  - [ ]* 10.2 Write adapter tests for AiClient
    - Mock OpenAI-compatible server covering success, unreachable, auth failure, and truncated responses; assert inputs preserved and errors carry no secrets
    - _Requirements: 14.3, 15.2_

  - [x] 10.3 Implement S3DocumentAdapter and TextExtractor
    - S3 adapter uses the ambient AWS credential chain (no hardcoded keys); list docx/pdf under the configured prefix and get objects; text extractor parses docx/pdf and marks unparsable files `not parsed` with partial-extraction flagging
    - _Requirements: 10.1, 10.2_

  - [ ]* 10.4 Write adapter tests for S3DocumentAdapter and TextExtractor
    - Mocked S3 for list/get plus failure cases (bad region, denied permission, missing object); docx/pdf fixtures plus an unparsable fixture
    - _Requirements: 10.1, 10.2_

  - [x] 10.5 Implement Repository (local file-backed store)
    - Persist tasks, output artifacts, running estimate, and document index as JSON on disk
    - _Requirements: 12.1, 15.1_

  - [ ]* 10.6 Write adapter tests for Repository
    - Verify persistence round-trips against a temp data directory
    - _Requirements: 12.1_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement configuration loading and Express routes (wiring)
  - [x] 12.1 Implement configuration loader
    - Read AI endpoint/model/credentials and S3 bucket/region/prefix from env and/or local config file; guard generation when AI config is missing; S3 credentials resolved from ambient chain only
    - _Requirements: 14.1, 14.2_

  - [x] 12.2 Implement task and generation routes with staged generation
    - `POST /tasks` (intake + constraint resolution + mode recommendation + SME selection + routing preview); `POST /tasks/:id/generate/:step` runs grounding → prompt assembly → AI call → validation → citation check → synthesis gate (briefs) → CCIR + running estimate; reject empty requirement text at the boundary and preserve inputs on AI failure; regenerating one step never mutates other steps' artifacts
    - _Requirements: 1.1, 2.1, 15.1, 15.2, 14.3, 3.2_

  - [ ]* 12.3 Write property test for staged regeneration isolation
    - **Property 16: Staged regeneration isolates steps**
    - **Validates: Requirements 15.1, 15.2**

  - [x] 12.4 Implement document, estimate, and config/health routes
    - `GET/POST /documents` (list S3 objects, tag with five metadata keys, flag untagged/Superseded/Draft); `GET /estimate` (running estimate with revision history and collisions); `GET /config/health` (AI endpoint reachability)
    - _Requirements: 10.2, 10.3, 10.4, 10.7, 12.1, 12.3, 14.3_

  - [ ]* 12.5 Write integration tests for routes
    - Exercise task creation and each generation step with faked adapters; assert error surfaces preserve inputs and carry no secrets
    - _Requirements: 14.3, 15.2_

- [x] 13. Implement React frontend and wire to backend
  - [x] 13.1 Implement TaskIntakeForm and AssumptionsPanel
    - Free-text requirement field, structured constraint fields (billets, POM funding cycle, facilities/ranges), Core Operational Process selector, Operational Mode selector with "Recommend" affordance; render resolved assumptions before generation
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 1.3_

  - [x] 13.2 Implement RoutingBlockView and StagedOutputWorkspace
    - Render the prepended routing block; one section per output step (Brief, Storyboard, SITREP, CUB, QPR, Order, Curriculum) each with independent "Regenerate this step" button and status (pending/generating/complete/failed/truncated)
    - _Requirements: 4.1, 15.1, 15.2_

  - [x] 13.3 Implement SynthesisGatePanel, CcirAlertBanner, RunningEstimateView, DocumentLibraryView, and AiConfigHealth
    - QA checks with failure highlighting; prominent CCIR banner with condition + recommended action; Billet Balance / Funding Status / Active CCIR Alerts / collisions / revision history; S3 doc list with metadata-tagging UI flagging untagged and Superseded/Draft; AI endpoint reachability and clear error state
    - _Requirements: 11.1, 11.2, 13.1, 13.2, 12.1, 12.2, 12.3, 10.2, 10.3, 10.4, 10.7, 14.3_

  - [ ]* 13.4 Write component tests for staged output and alerts
    - Assert per-step regeneration UI isolates steps and CCIR/QA panels render fired conditions and failures
    - _Requirements: 15.2, 11.2, 13.1_

- [ ] 14. Final integration and end-to-end smoke test
  - [ ] 14.1 Wire the full staged-generation flow end to end
    - Connect frontend to all backend routes; ensure a Full Staff task produces the executive brief and the 6-slide storyboard as separate, independently regenerable generation steps
    - _Requirements: 15.1, 2.4, 4.1_

  - [ ]* 14.2 Write end-to-end smoke test with faked side effects
    - Create task → recommend mode → select SMEs → build routing → filter fake grounding → assemble prompt → fake AI returns well-formed brief → validate → synthesis gate → update running estimate; assert brief + storyboard produced as independent artifacts
    - _Requirements: 15.1, 15.2, 2.4_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific granular requirements for traceability.
- Property tests (P1–P16) validate the universal correctness invariants of the pure orchestration core and are placed immediately after the code they validate.
- Unit, adapter, and integration tests validate specific examples, error paths, and boundary side effects (AI, S3, extraction, persistence).
- Checkpoints ensure incremental validation before moving to the next layer.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.3", "5.1", "5.5", "7.1", "7.3", "7.5", "9.1", "9.3", "9.5", "10.1", "10.3", "10.5", "12.1"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.1", "5.2", "5.3", "5.4", "5.6", "6.1", "7.2", "7.4", "7.6", "7.7", "9.2", "9.4", "9.6", "9.7", "10.2", "10.4", "10.6"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "6.2"] },
    { "id": 4, "tasks": ["3.5", "3.6", "12.2", "12.4"] },
    { "id": 5, "tasks": ["12.3", "12.5", "13.1"] },
    { "id": 6, "tasks": ["13.2", "13.3"] },
    { "id": 7, "tasks": ["13.4", "14.1"] },
    { "id": 8, "tasks": ["14.2"] }
  ]
}
```

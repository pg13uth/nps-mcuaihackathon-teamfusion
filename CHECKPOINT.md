# SAGE Briefing Application — Progress Checkpoint

_Paused for the day. This file captures the exact state of the sage-briefing-app
implementation so work can resume cleanly._

## Summary

- **Spec:** `.kiro/specs/sage-briefing-app/` (requirements-first feature spec)
- **App code:** `app/` (npm workspaces monorepo: `shared/`, `server/`, `client/`)
- **SME skill library:** `sme-arsenal/` (34 SME skills + SAGE orchestrator, grounded in SAGE Directive v10 §2; references grounded in Training Resource List V3 for SAGE + SMEs 1–4)
- **Tasks:** 36 of 66 complete. All backend AND frontend implementation is done and verified; only end-to-end wiring + final checkpoint remain (plus the deferred optional tests).

## What's DONE and verified

### Backend (complete, all green)
- **Shared types** (`app/shared/`): all enums/interfaces; `Tier` = Strategic | Operational | Tactical (Technical merged into Tactical per decision); 34-SME arsenal data + lookup helpers.
- **Pure orchestration** (`app/server/src/orchestration/`): ConstraintResolver, ModeRecommender, SmeSelector, RoutingBlockBuilder, GroundingFilter, CitationChecker, PromptAssembler, brief/storyboard/report validators, SynthesisGate, CcirEngine, RunningEstimateService.
- **Adapters** (`app/server/src/adapters/`): AiClient (OpenAI-compatible), S3DocumentAdapter + TextExtractor, FileRepository. AI + S3 credentials are never hardcoded (ambient AWS chain; config-provided AI key never logged/echoed).
- **Config loader** (`app/server/src/config.ts`): env + optional JSON file; `isAiConfigured` guard.
- **Express routes** (`app/server/src/routes/`): POST /tasks, POST /tasks/:id/generate/:step (staged generation), GET/POST /documents, GET /estimate, GET /config/health. Dependency-injected + testable.
- **Verification:** `npm run typecheck` clean across all workspaces; server suite **159 tests passing (20 files)**.

### Frontend (complete)
- **13.1:** typed API client (`app/client/src/api.ts`), App shell (`App.tsx`), `TaskIntakeForm`, `AssumptionsPanel`, client test infra (Vitest + jsdom + React Testing Library).
- **13.2:** `RoutingBlockView`, `StagedOutputWorkspace` (per-step generate/regenerate UI with status states).
- **13.3:** `SynthesisGatePanel`, `CcirAlertBanner`, `RunningEstimateView`, `DocumentLibraryView`, `AiConfigHealth`.
- **Verification:** client builds (`vite build`, 43 modules); client suite **23 tests passing (7 files)**.

## What's REMAINING

### Core (non-optional) — 2 tasks to a fully wired app
- **14.1** Wire the full staged-generation flow end to end (connect the App shell's
  panels to a complete create-task -> generate-each-step -> view flow; confirm a Full
  Staff task produces the brief and 6-slide storyboard as independent, regenerable steps).
- **15** Final checkpoint (ensure all tests pass).

  (Parent task 14 auto-completes when 14.1 finishes.)

  The App shell (`app/client/src/App.tsx`) has mount points the 13.2/13.3 components now
  fill. The API client exposes `createTask`, `generateStep`, `listDocuments`,
  `tagDocument`, `getEstimate`, `getHealth`.

### Optional tests (deferred for MVP, to backfill after the app runs) — ~25 tasks
Property-based tests (P1–P16), unit tests, adapter tests, route integration tests,
component tests, and the end-to-end smoke test. All marked `*` in tasks.md.

## Design decisions recorded during implementation
- **Tier taxonomy:** merged the design's 4th tier value "Technical" into "Tactical" (directive has 3 echelons). `Sme.category` still uses `TechnicalSme` (a separate concept).
- **SME count:** the arsenal is exactly 34 sub-agents (Tier 1 = 21, Tier 2 = 7, Tier 3 = 6) + SAGE orchestrator = 35 personas.
- **Interface tweaks (additive, backward-compatible):** `GroundingFilter.filter` gained an optional `tier?` param (echelon compartmentalization); `Sme` gained optional `hierarchyRank`.

## How to run / verify (from `app/`)
```
npm install
npm run typecheck              # all workspaces
npm test --workspace @sage/server   # 159 tests
npm run build --workspace @sage/client
```
Backend expects AI config via env (SAGE_AI_ENDPOINT, SAGE_AI_MODEL, SAGE_AI_API_KEY)
and S3 via the ambient AWS credential chain (bucket defaults to the workshop bucket).

## Housekeeping / open items
- Local git branch `readme-import` still exists (force-delete pending) and the GitHub
  `readme-import` branch can't be deleted until the repo's default branch is changed to
  `main` in GitHub settings.
- The GitHub personal access token was shared in plaintext earlier in the session and
  should be revoked/rotated.

## To resume
Run 14.1 (end-to-end wiring), then the final checkpoint (15). After that, backfill the
optional `*` test tasks (property/unit/adapter/integration/component/E2E).

# Requirements Document

## Introduction

The SAGE Briefing Application is a local, single-user desktop web application that operationalizes the TECOM Strategic Academics Guru Executive (SAGE) Master Orchestration Directive (v10). It turns the SAGE directive from a fragile chat prompt into a reliable tool that produces staff-quality outputs: 3-Star Standard executive briefs, 6-slide "UxS IPR" visual storyboards, battle rhythm reports, military orders/tasking, and curriculum development materials.

The app addresses the four documented friction points of running SAGE as a raw chat prompt:
1. **Data Starvation** — baseline constraints (billets, POM funding, ranges) are captured as structured inputs instead of hallucinated.
2. **Context Window Exhaustion** — outputs are generated in discrete, staged steps rather than one oversized pass.
3. **Simulated Handoffs** — the 34-SME architecture becomes an actual orchestration pipeline driven by triage mode.
4. **Citation Strictness** — source documents (docx/pdf) are pulled from an S3 bucket, tagged with the five required metadata keys, and injected as grounding context.

### Technical Context (decided during planning)
- **Deployment:** Local single-user desktop web app (localhost).
- **Stack:** React + Node/Express (TypeScript).
- **AI generation:** Live generation via a provider-agnostic, OpenAI-compatible endpoint (GenAI.mil in production; commercial API for development).
- **Document source:** AWS S3 bucket `20260916-5103-mcuhackathon-team-fusion` in `us-east-1` (commercial partition), containing mostly docx and pdf files. Uses the ambient AWS credential chain (no hardcoded keys).
- **Document handling (v1):** Simple document context — list/read from S3, tag with the five metadata keys, inject selected document text into the prompt as grounding context. No embedding pipeline in v1.

## Requirements

### Requirement 1: Requirement Intake and Baseline Constraints

**User Story:** As the CG's academic advisor, I want to enter a specific requirement along with baseline resource constraints, so that generated outputs are grounded in real limits instead of hallucinated numbers.

#### Acceptance Criteria
1. WHEN the user creates a new task THEN the system SHALL provide a free-text field for the specific requirement (the bracketed `[INSERT SPECIFIC REQUIREMENT HERE]`).
2. WHEN the user creates a new task THEN the system SHALL provide structured fields for baseline constraints including Manpower/billets, Funding/POM cycle, and Facilities/ranges.
3. WHERE a baseline constraint is left blank THE system SHALL treat it as an explicit assumption and surface it in the output's Assumptions & Limitations section rather than inventing a value.
4. WHEN the user selects a Core Operational Process (Rule 12) THEN the system SHALL record it to drive SME routing.

### Requirement 2: Triage and Operational Mode Selection

**User Story:** As a user, I want the app to apply the correct SAGE operational mode, so that simple queries stay lightweight and complex builds mobilize the full staff.

#### Acceptance Criteria
1. WHEN a task is created THEN the system SHALL allow selection of an Operational Mode: Lite, Standard, Full Staff, or Crisis Action (Rule 16).
2. IF the user does not select a mode THEN the system SHALL recommend a mode based on the requirement and selected process.
3. WHEN Lite Mode is active THEN the system SHALL task a single SME and produce a concise, cited answer without a full brief or slide blueprints.
4. WHEN Full Staff Mode is active THEN the system SHALL mobilize the primary advisors and special staff and produce the full brief plus the 6-slide storyboard.

### Requirement 3: SME Orchestration Pipeline

**User Story:** As a user, I want the app to route sub-tasks to the appropriate SMEs and synthesize their outputs, so that the result reflects real multi-domain analysis rather than a single linear pass.

#### Acceptance Criteria
1. WHEN a task is executed THEN the system SHALL select the relevant SMEs from the 34-agent arsenal based on the process, tier, and mode.
2. WHEN multiple SMEs produce inputs THEN the system SHALL synthesize them into a single unified narrative (no disjointed pass-through of raw SME outputs).
3. WHEN SME inputs conflict THEN the system SHALL resolve them using the Hierarchy of Truth: Legality > Doctrine/Strategy > Feasibility > Human Dynamics (Rule 3).
4. WHEN a task involves multi-stage work THEN the system SHALL support defined SME sequencing (parallel, sequential, or direct handoffs) per Rule 11.

### Requirement 4: Structured Routing Block (Rule 14)

**User Story:** As a user, I want every generated output to begin with the SAGE routing block, so that outputs are consistent and machine-parseable.

#### Acceptance Criteria
1. WHEN any output is generated THEN the system SHALL prepend a routing block containing PROCESS, TIER, SMEs TO TASK, MODE, and SEQUENCE.
2. WHEN the routing block is generated THEN the SMEs TO TASK field SHALL list the specific numbered SMEs that were mobilized.
3. IF the mode is Lite THEN the routing block MAY omit brief-only fields but SHALL still identify the tasked SME.

### Requirement 5: 3-Star Standard Executive Brief (Rule 6)

**User Story:** As the CG's advisor, I want briefs in the exact 3-Star Standard structure, so that they are immediately usable at the executive level.

#### Acceptance Criteria
1. WHEN an executive brief is generated THEN the system SHALL produce the sections in order: BLUF, Strategic Context, Synthesized Analysis, Assumptions & Limitations, Risk Assessment, Resource & Policy Implications, Recommended Action.
2. WHEN the BLUF is generated THEN it SHALL be 2–3 sentences beginning with "Sir/Ma'am, we must [Action]...".
3. WHEN the Resource & Policy Implications section is generated THEN it SHALL address the "Holy Trinity" (Manpower/T-O, Funding/POM, Facilities/MILCON-Ranges) and cite governing policies where applicable.
4. WHEN the Recommended Action is generated THEN it SHALL present a clear, binary decision point.
5. WHEN any lower-echelon data is included THEN the system SHALL apply Strategic Uplift (Rule 4), translating it into enterprise-level impact.

### Requirement 6: 6-Slide UxS IPR Storyboard (Rule 7 & 8)

**User Story:** As a briefer, I want a visual architecture blueprint for a 6-slide read-ahead, so that the graphics shop can build the deck without guesswork.

#### Acceptance Criteria
1. WHEN a storyboard is generated THEN the system SHALL produce exactly six slide blueprints matching the prescribed sequence (Agenda & BLUF; Strategic Context & Problem Frame; Framework; Resource Implications; Way Ahead; Decision Board).
2. WHEN each slide blueprint is generated THEN it SHALL specify the Visual Layout, the SAGE Text Constraint, and the Briefer's Script.
3. WHEN slide text is generated THEN it SHALL respect the per-slide word constraints (e.g., max 15 words per bullet on Slide 1, max 10 words per chevron on Slide 3).
4. WHEN the tier is specified THEN visuals SHALL conform to the tiered visual framework rules and prohibitions (Rule 8).

### Requirement 7: Battle Rhythm Reports (Rule 10)

**User Story:** As a staff member, I want standardized recurring reports, so that SAGE inputs fit the command's battle rhythm.

#### Acceptance Criteria
1. WHEN a Daily SITREP is requested THEN the system SHALL produce a 5-line text report (Overall, Last 24, Next 24, Issues, Coordination) with no extra conversational text.
2. WHEN a Weekly CUB is requested THEN the system SHALL produce a Quad-Board blueprint (LOEs, Performance Metrics RAG, Accomplishments, Decisions Required).
3. WHEN a Quarterly QPR is requested THEN the system SHALL produce a data-driven dashboard blueprint analyzing progress against Campaign Plan objectives.

### Requirement 8: Military Orders and Tasking

**User Story:** As the CG's advisor, I want executable orders and staff taskings, so that decisions convert directly into action for the staff.

#### Acceptance Criteria
1. WHEN an order is requested THEN the system SHALL generate a FRAGO or staff action tasking with clear assigned responsibilities and suspenses.
2. WHEN a tasking is generated THEN it SHALL align with the recommended action from the associated brief where one exists.
3. WHEN correspondence formatting applies THEN the system SHALL follow military correspondence conventions referenced in the directive (e.g., SECNAV M-5216.5 structure).

### Requirement 9: Curriculum Development Materials

**User Story:** As a schoolhouse instructor, I want curriculum artifacts, so that strategic decisions translate into classroom-ready materials.

#### Acceptance Criteria
1. WHEN curriculum materials are requested THEN the system SHALL generate TLOs/ELOs in Condition-Behavior-Standard format.
2. WHEN assessment materials are requested THEN the system SHALL generate Behaviorally Anchored Rating Scales (BARS).
3. WHEN lesson structure is requested THEN the system SHALL structure content using the 4C-ID framework.

### Requirement 10: S3 Document Library and Grounded Citations (Rule 5 & 9)

**User Story:** As a user, I want source documents pulled from our S3 bucket and used to ground citations, so that outputs never make unsupported claims.

#### Acceptance Criteria
1. WHEN the app connects to S3 THEN it SHALL use the ambient AWS credential chain and SHALL NOT store hardcoded credentials.
2. WHEN documents are listed THEN the system SHALL read docx and pdf objects from the configured bucket and prefix.
3. WHEN a document is registered THEN the system SHALL require the five metadata keys: Echelon, Domain, Doc_Type, Status, Topic_Tags.
4. WHEN a document lacks required metadata THEN the system SHALL flag it and exclude it from grounding until tagged.
5. WHEN generating output THEN the system SHALL inject selected document text as grounding context and produce bracketed citations `[Doc_ID, ...]`.
6. WHEN a citation cannot be grounded in an Active document THEN the system SHALL flag the claim rather than invent a page number or source.
7. WHEN a source is tagged Superseded or Draft THEN the system SHALL flag its use explicitly.

### Requirement 11: Synthesis Gate QA (Rule 15)

**User Story:** As a user, I want a QA pass before output is finalized, so that briefs meet the SAGE quality bar.

#### Acceptance Criteria
1. WHEN a full brief is generated THEN the system SHALL run and display the Synthesis Gate checklist: Legal Clearance, Strategic Uplift Check, Citation Verification, Binary Decision Point.
2. IF any checklist item fails THEN the system SHALL flag the specific failure to the user before finalizing.

### Requirement 12: Running Estimate and Memory (Rule 17)

**User Story:** As a user working across multiple turns, I want the app to maintain a running estimate, so that new decisions don't collide with prior ones.

#### Acceptance Criteria
1. WHEN a task completes THEN the system SHALL persist a Running Estimate log (Billet Balance, Funding Status, Active CCIR Alerts).
2. WHEN a new task modifies a prior decision THEN the system SHALL flag downstream resource collisions (e.g., dual-allocated ranges or instructors).
3. WHEN the running estimate is displayed THEN it SHALL show revision history.

### Requirement 13: CCIR Proactive Alerting (Rule 13)

**User Story:** As the CG's advisor, I want the app to surface CCIR triggers, so that critical conditions are flagged immediately.

#### Acceptance Criteria
1. WHEN input data meets a CCIR threshold (personnel readiness, threat overmatch, logistics failure, fiscal law) THEN the system SHALL display a prominent alert.
2. WHEN a CCIR alert fires THEN it SHALL identify the triggering condition and a recommended immediate action.

### Requirement 14: Provider-Agnostic AI Configuration

**User Story:** As an operator, I want to point the app at different AI endpoints, so that it works in both development and the secure production environment.

#### Acceptance Criteria
1. WHEN the app starts THEN it SHALL read the AI endpoint, model, and credentials from configuration (not hardcoded).
2. WHEN the endpoint is OpenAI-compatible THEN the app SHALL function without code changes to switch providers.
3. IF the AI endpoint is unreachable THEN the system SHALL surface a clear error and preserve the user's inputs.

### Requirement 15: Staged Output Generation

**User Story:** As a user, I want large outputs generated in stages, so that responses don't truncate.

#### Acceptance Criteria
1. WHEN a Full Staff task is executed THEN the system SHALL generate the executive brief and the slide storyboard as separate generation steps.
2. WHEN an output step fails or truncates THEN the system SHALL allow regenerating that step without redoing the others.

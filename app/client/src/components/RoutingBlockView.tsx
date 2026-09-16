/**
 * RoutingBlockView (Task 13.2) — renders the SAGE routing block that is
 * prepended to every generated output (Rule 14 / Requirement 4.1).
 *
 * The block surfaces the five fields the directive requires:
 *   - PROCESS      (Core Operational Process, Rule 12)
 *   - TIER         (echelon: Strategic / Operational / Tactical)
 *   - SMEs TO TASK (the specific numbered SMEs mobilized, Requirement 4.2)
 *   - MODE         (Operational Mode, Rule 16)
 *   - SEQUENCE     (parallel / sequential / handoff, Rule 11)
 *
 * The component is presentational: it takes a {@link RoutingBlock} (the
 * `routingPreview` from `POST /tasks`, held in App state) and renders it. It
 * performs no data fetching, so it can be reused anywhere a routing block is
 * available (e.g. alongside a generated artifact).
 */

import type { CoreProcess, OperationalMode, RoutingBlock, Tier } from "@sage/shared";
import "./stagedOutput.css";

/** Human-readable labels for Core Operational Processes (Rule 12). */
const PROCESS_LABELS: Record<CoreProcess, string> = {
  ProgramObjectiveMemorandum: "Program Objective Memorandum (POM)",
  CampaignPlanning: "Campaign Planning",
  CurriculumDevelopment: "Curriculum Development",
  CapabilityAssessment: "Capability Assessment",
  CrisisResponse: "Crisis Response",
  PolicyDevelopment: "Policy Development",
};

/** Human-readable labels for Operational Modes (Rule 16). */
const MODE_LABELS: Record<OperationalMode, string> = {
  Lite: "Lite",
  Standard: "Standard",
  FullStaff: "Full Staff",
  CrisisAction: "Crisis Action",
};

/** Human-readable labels for tiers. */
const TIER_LABELS: Record<Tier, string> = {
  Strategic: "Strategic",
  Operational: "Operational",
  Tactical: "Tactical",
};

/** Human-readable labels for the SME sequence kind (Rule 11). */
const SEQUENCE_LABELS: Record<RoutingBlock["sequence"]["kind"], string> = {
  parallel: "Parallel",
  sequential: "Sequential",
  handoff: "Direct Handoff",
};

export interface RoutingBlockViewProps {
  routing: RoutingBlock;
}

export function RoutingBlockView({ routing }: RoutingBlockViewProps) {
  const smes = routing.smesToTask;
  const sequenceOrder = routing.sequence.order;

  return (
    <section
      aria-labelledby="routing-block-heading"
      className="panel routing-block"
      data-testid="routing-block"
    >
      <h2 id="routing-block-heading">Routing Block</h2>
      <dl className="routing-grid">
        <div className="routing-row">
          <dt>PROCESS</dt>
          <dd data-testid="routing-process">{PROCESS_LABELS[routing.process]}</dd>
        </div>

        <div className="routing-row">
          <dt>TIER</dt>
          <dd data-testid="routing-tier">{TIER_LABELS[routing.tier]}</dd>
        </div>

        <div className="routing-row">
          <dt>SMEs TO TASK</dt>
          <dd data-testid="routing-smes">
            {smes.length === 0 ? (
              <span className="routing-empty">None</span>
            ) : (
              smes.map((id) => id).join(", ")
            )}
          </dd>
        </div>

        <div className="routing-row">
          <dt>MODE</dt>
          <dd data-testid="routing-mode">{MODE_LABELS[routing.mode]}</dd>
        </div>

        <div className="routing-row">
          <dt>SEQUENCE</dt>
          <dd data-testid="routing-sequence">
            {SEQUENCE_LABELS[routing.sequence.kind]}
            {sequenceOrder.length > 0 ? (
              <span className="routing-sequence-order">
                {" "}
                ({sequenceOrder.join(" \u2192 ")})
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

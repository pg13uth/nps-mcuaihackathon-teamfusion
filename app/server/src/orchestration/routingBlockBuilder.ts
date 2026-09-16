/**
 * RoutingBlockBuilder (pure orchestration).
 *
 * Rule 14 / Requirements 4.1, 4.2, 4.3.
 *
 * Produces the structured {@link RoutingBlock} that is prepended to every SAGE
 * artifact: PROCESS / TIER / SMEs TO TASK / MODE / SEQUENCE. This builder emits
 * the structured object only — a sibling {@link PromptAssembler} is responsible
 * for rendering a routing block into briefing text. The two are kept consistent
 * (same field semantics) but independent (no shared rendering here).
 *
 * Behavior summary:
 *   - `smesToTask` lists the specific numbered SME ids that were mobilized
 *     (Requirement 4.2). The ids are taken from the provided `smes`, ordered by
 *     the provided `sequence.order` where available so the routing block matches
 *     the execution order computed by the SME selector, then any remaining
 *     mobilized SMEs (not named in the sequence) are appended in their given
 *     order. De-duplicated, preserving first-seen order.
 *   - Lite mode may omit brief-only fields downstream, but the routing block
 *     SHALL still identify the single tasked SME (Requirement 4.3, design
 *     Property 1). Because `smesToTask` is derived directly from the provided
 *     `smes`, a Lite selection of exactly one SME yields exactly one id.
 *   - Pure and deterministic: identical inputs always yield an identical
 *     {@link RoutingBlock}; no I/O, no randomness, no mutation of inputs.
 *
 * Design Property 1 (Routing block always identifies the tasked SMEs): every id
 * in `smesToTask` is a member of the provided `smes`, and the list is non-empty
 * whenever `smes` is non-empty.
 */

import {
  type CoreProcess,
  type OperationalMode,
  type RoutingBlock,
  type RoutingBlockBuilder,
  type Sme,
  type SmeSequence,
  type Tier,
} from "@sage/shared";

/**
 * Order the mobilized SME ids by the sequence's execution order where
 * available. Ids named in `sequence.order` come first (in sequence order, but
 * only if they correspond to a provided SME); any remaining provided SMEs are
 * appended in their given order. The result is de-duplicated, preserving
 * first-seen order, and every id is guaranteed to be a member of `smes`.
 */
function orderSmesToTask(smes: readonly Sme[], sequence: SmeSequence): number[] {
  const providedIds = new Set(smes.map((sme) => sme.id));
  const out: number[] = [];
  const seen = new Set<number>();

  const push = (id: number): void => {
    if (providedIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };

  // 1. Sequence order first (only ids that map to a provided SME).
  for (const id of sequence.order) {
    push(id);
  }
  // 2. Any remaining provided SMEs, in their given order.
  for (const sme of smes) {
    push(sme.id);
  }

  return out;
}

/**
 * Pure functional form of routing-block construction. Deterministic given its
 * inputs. Sets `smesToTask` to the provided SME ids (in sequence order where
 * available); for Lite mode this still identifies the single tasked SME.
 */
export function buildRoutingBlock(input: {
  process: CoreProcess;
  tier: Tier;
  mode: OperationalMode;
  smes: Sme[];
  sequence: SmeSequence;
}): RoutingBlock {
  const { process, tier, mode, smes, sequence } = input;

  return {
    process,
    tier,
    smesToTask: orderSmesToTask(smes, sequence),
    mode,
    sequence,
  };
}

/**
 * Class implementation of the {@link RoutingBlockBuilder} orchestration
 * interface. Delegates to the pure {@link buildRoutingBlock} function.
 */
export class DefaultRoutingBlockBuilder implements RoutingBlockBuilder {
  build(input: {
    process: CoreProcess;
    tier: Tier;
    mode: OperationalMode;
    smes: Sme[];
    sequence: SmeSequence;
  }): RoutingBlock {
    return buildRoutingBlock(input);
  }
}

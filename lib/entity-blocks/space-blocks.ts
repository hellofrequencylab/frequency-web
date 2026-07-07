import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { blocksForKind, type EntityBlockDef } from './registry'

// SPACE BLOCK GATING (ADR-516 Phase D; ADR-573 item 6). A space DATA block can carry a `requiresFunction` —
// the SPACE_FUNCTION that must be enabled for the block to appear (booking → availability, team → members).
// The in-rail Space page builder must NOT offer a block the space cannot use, mirroring the standalone grid
// editor's `locked` handling: an arrangeable block is one whose required function is on (or which carries
// none); a locked block is held out of the picker + the bench until the feature turns on.
//
// ADR-573 item 6 ("don't show a function unless it EXISTS") strengthens this. The `requiresFunction` switch
// alone only gates booking/team; a function-backed block like Offerings / Events / Team has no data until the
// operator adds items. So the getter ALSO passes the set of function-backed blocks that currently EXIST for
// this Space (existingFunctionBackedBlocks: the switch is on AND there is at least one item). A block that is
// function-backed but NOT in that set is locked too, so a Space never sees an empty Offerings / Team block in
// the palette. PURE (no IO / React) — the server caller resolves the two sets and this composes them, so a
// unit test asserts the gate directly.

/** Split the space palette into the blocks a space with these enabled functions may arrange, and the ids
 *  locked behind a function it does not have on OR (item 6) a function-backed block that has no data yet.
 *  `enabled` is the space's live function-switch set. `functionAware`, when supplied, carries item 6's finer
 *  gate: `functionBacked` = every block id that is function-backed (has a data source), and `existing` = the
 *  subset that currently has data. A function-backed block absent from `existing` is locked. When
 *  `functionAware` is omitted the behaviour is unchanged (switch gate only), so existing callers keep working. */
export function partitionSpaceBlocks(
  enabled: ReadonlySet<SpaceFunctionKey>,
  functionAware?: { functionBacked: ReadonlySet<string>; existing: ReadonlySet<string> },
): {
  arrangeable: EntityBlockDef[]
  lockedIds: string[]
} {
  const arrangeable: EntityBlockDef[] = []
  const lockedIds: string[] = []
  for (const block of blocksForKind('space')) {
    const switchLocked = block.requiresFunction != null && !enabled.has(block.requiresFunction)
    // Item 6: a function-backed block with no data is locked (hidden from the palette + bench) until it
    // has items. Non-function-backed blocks (authored content, design blocks) are never gated this way.
    const dataLocked =
      functionAware != null &&
      functionAware.functionBacked.has(block.id) &&
      !functionAware.existing.has(block.id)
    if (switchLocked || dataLocked) {
      lockedIds.push(block.id)
    } else {
      arrangeable.push(block)
    }
  }
  return { arrangeable, lockedIds }
}

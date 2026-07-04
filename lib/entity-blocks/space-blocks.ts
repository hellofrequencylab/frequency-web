import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { blocksForKind, type EntityBlockDef } from './registry'

// SPACE BLOCK GATING (ADR-516 Phase D). A space DATA block can carry a `requiresFunction` — the
// SPACE_FUNCTION that must be enabled for the block to appear (booking → availability, team → members).
// The in-rail Space page builder must NOT offer a block the space cannot use, mirroring the standalone
// grid editor's `locked` handling: an arrangeable block is one whose required function is on (or which
// carries none); a locked block is held out of the picker + the bench until the feature turns on. PURE
// (no IO / React), so the getter composes it and a unit test asserts it directly.

/** Split the space palette into the blocks a space with these enabled functions may arrange, and the ids
 *  locked behind a function it does not have on. `enabled` is the space's live function set. */
export function partitionSpaceBlocks(enabled: ReadonlySet<SpaceFunctionKey>): {
  arrangeable: EntityBlockDef[]
  lockedIds: string[]
} {
  const arrangeable: EntityBlockDef[] = []
  const lockedIds: string[] = []
  for (const block of blocksForKind('space')) {
    if (block.requiresFunction != null && !enabled.has(block.requiresFunction)) {
      lockedIds.push(block.id)
    } else {
      arrangeable.push(block)
    }
  }
  return { arrangeable, lockedIds }
}

// SPOTLIGHT CAPS (the Spotlight split, owner picks 2026-10-28). PURE: no IO. How many blocks a saved layout
// places, and the one sentence a refusal shows. The allowance itself is the `spotlight_blocks` meter
// (lib/pricing/meter-limits.ts); the check that asks it is saveMemberGridLayout.

/** Blocks a layout places, whether it is the type-keyed rows or the node document (both are rows of cells).
 *  Anything that is not a layout counts as none. */
export function countPlacedBlocks(layout: unknown): number {
  const rows = (layout as { rows?: unknown } | null | undefined)?.rows
  if (!Array.isArray(rows)) return 0
  let n = 0
  for (const row of rows) {
    const cells = (row as { cells?: unknown } | null | undefined)?.cells
    if (!Array.isArray(cells)) continue
    for (const cell of cells) if (Array.isArray(cell)) n += cell.length
  }
  return n
}

/** Is this save allowed? A layout no bigger than the one already saved is always fine (never retroactive);
 *  growth past the allowance is refused. `allowed` is the tier's answer for the new total. */
export function growsPastCap(next: number, saved: number, allowed: boolean): boolean {
  return next > saved && !allowed
}

export const SPOTLIGHT_BLOCKS_MESSAGE = 'Your Spotlight is full for now. Crew adds room for more blocks.'

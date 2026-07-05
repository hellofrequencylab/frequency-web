import type { RowDef } from './layout'

// PURE box-position helpers for the on-page WYSIWYG space editor (ADR-542). A "box" is one placed block id;
// a column (`cells[i]`) is a STACK of boxes. The on-page editor's per-box toolbar needs to know where a box
// sits (which row / column / stack index) so it can disable "move up" at the top of a stack and "move down"
// at the bottom. Framework-free (no React), so the editor and its unit test share one source. Total: an
// unplaced id returns null, and the move guards read false rather than throwing.

/** Where a placed box sits in the freeform layout. */
export interface BoxPosition {
  rowId: string
  /** The column index within the row (0-based). */
  col: number
  /** The box's index within its column stack (0 = top). */
  index: number
  /** How many boxes are stacked in that column. */
  stackLength: number
}

/** Find where `blockId` sits (first match, scanning rows then columns then stacks), or null when unplaced. */
export function findBoxPosition(rows: RowDef[], blockId: string): BoxPosition | null {
  for (const row of rows) {
    for (let col = 0; col < row.cells.length; col++) {
      const stack = row.cells[col]
      const index = stack.indexOf(blockId)
      if (index !== -1) {
        return { rowId: row.id, col, index, stackLength: stack.length }
      }
    }
  }
  return null
}

/** Whether the box can move up within its own column (it is placed and not already at the top). */
export function canMoveBoxUp(rows: RowDef[], blockId: string): boolean {
  const pos = findBoxPosition(rows, blockId)
  return pos !== null && pos.index > 0
}

/** Whether the box can move down within its own column (it is placed and not already at the bottom). */
export function canMoveBoxDown(rows: RowDef[], blockId: string): boolean {
  const pos = findBoxPosition(rows, blockId)
  return pos !== null && pos.index < pos.stackLength - 1
}

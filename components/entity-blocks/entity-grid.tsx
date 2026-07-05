import type { ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'

// The presentational interior GRID for the unified entity-block renderers (ADR-508 → ADR-516 Phase A).
// DATA-DRIVEN: it renders a freeform RowDef[] (the source of truth going forward) instead of switching on
// a fixed template id. Each row is a band of `columns` EQUAL columns; a 1-column row emits its block
// DIRECTLY into the shared `@container space-y-6` stack (so the single-column default renders byte-
// identically to the pre-ADR-516 `single` template: N 1-col rows === N stacked blocks in one container).
// A multi-column row is a CSS grid whose cells each carry their OWN `@container` (Tailwind v4) so a block
// sizes to where it lands and the columns collapse to one on small screens. Presentational + server-safe
// (no hooks / no 'use client'), so a Server Component renderer drops it in directly. Fail-safe by
// construction: an empty cell (null slot) or an id the caller does not know renders nothing.

/** Column class per row width: stack on mobile, N-up at the sm/lg breakpoint (capped at 4). */
const GRID_COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

/** A 2-column row's grid class: even 50/50, `lead` = 66/33 (wider first column), or `trail` = 33/66
 *  (wider second column). Stacks on mobile either way. */
function columnsClass(columns: number, ratio: string | undefined): string {
  if (columns === 2) {
    if (ratio === 'lead') return 'sm:grid-cols-[2fr_1fr]'
    if (ratio === 'trail') return 'sm:grid-cols-[1fr_2fr]'
  }
  return GRID_COLS[columns] ?? ''
}

export function EntityGrid({
  rows,
  renderBlock,
}: {
  /** The effective freeform rows (from resolveRows). */
  rows: RowDef[]
  /** Render a single block by its id (returns null / empty when the caller does not render it). The
   *  returned node MUST carry its own React key (the callers wrap each block in a keyed <Suspense>). */
  renderBlock: (blockId: string) => ReactNode
}) {
  return (
    <div className="@container space-y-6">
      {rows.map((row) => {
        // A 1-column row emits its column's stacked blocks directly into the shared stack — no grid
        // wrapper — so a single-column layout renders as N stacked blocks in one `space-y-6` container.
        if (row.columns === 1) {
          const stack = row.cells[0] ?? []
          return stack.map((id) => renderBlock(id))
        }
        return (
          <div key={row.id} className={`grid gap-6 ${columnsClass(row.columns, row.ratio)}`}>
            {row.cells.map((stack, i) => (
              <div key={`${row.id}-${i}`} className="@container space-y-6">
                {stack.map((id) => renderBlock(id))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

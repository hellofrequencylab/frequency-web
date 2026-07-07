import type { ReactNode } from 'react'
import { rowShowsHeader, type RowDef } from '@/lib/entity-blocks/layout'
import { marginBottomClass, marginTopClass } from '@/lib/entity-blocks/block-content'

// The presentational interior GRID for the unified entity-block renderers (ADR-508 → ADR-516 Phase A).
// DATA-DRIVEN: it renders a freeform RowDef[] (the source of truth going forward) instead of switching on
// a fixed template id. Each row is a band of `columns` EQUAL columns; a 1-column row emits its block
// DIRECTLY into the shared `@container space-y-8` stack (so the single-column default renders byte-
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

/** The LIVE per-row header (Fix 5): the row's title as a semantic section heading, shown only when the
 *  operator turned the row header on. Kit tokens only (no hex), voice-neutral. Sits above the row content. */
function RowHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-4 font-display text-xl font-bold uppercase tracking-tight text-text sm:text-2xl">
      {title}
    </h2>
  )
}

/** Whether a row holds at least one placed block id (any column). A header over a row with no blocks reads
 *  as a bug (ADR-562), so the header is suppressed for an empty row even when toggled on. */
function rowHasBlocks(row: RowDef): boolean {
  return row.cells.some((stack) => stack.length > 0)
}

/** The per-row MARGIN classes (ADR-569 C3), or '' when the row sets none. A set margin wraps the row so the
 *  extra space above / below the band renders; the common no-margin row keeps its bare fast path. */
function rowMarginClass(row: RowDef): string {
  return [marginTopClass(row.mt), marginBottomClass(row.mb)].filter(Boolean).join(' ')
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
    <div className="@container space-y-8">
      {rows.map((row) => {
        // The optional LIVE row header (Fix 5): shown only when the toggle is on, the title is non-blank,
        // AND the row actually holds blocks (never a lone header over an empty row).
        const showHeader = rowShowsHeader(row) && rowHasBlocks(row)
        // The optional per-row MARGIN (ADR-569 C3). When set (or a header is shown) the row is wrapped in a
        // <section> so the extra space renders; otherwise the bare fast path is kept byte-identical.
        const mCls = rowMarginClass(row)
        const wrap = showHeader || !!mCls

        // A 1-column row emits its column's stacked blocks directly into the shared stack — no grid wrapper
        // — so a single-column layout WITHOUT a header renders byte-identically to before (N stacked blocks
        // in one `space-y-8` container). A header wraps that row in its own <section> so the heading sits
        // above the stack.
        if (row.columns === 1) {
          const stack = row.cells[0] ?? []
          if (!wrap) return stack.map((id) => renderBlock(id))
          return (
            <section key={row.id} className={`space-y-8 ${mCls}`.trim()}>
              {showHeader && <RowHeader title={row.title!} />}
              {stack.map((id) => renderBlock(id))}
            </section>
          )
        }
        const grid = (
          <div className={`grid gap-8 ${columnsClass(row.columns, row.ratio)}`}>
            {row.cells.map((stack, i) => (
              <div key={`${row.id}-${i}`} className="@container space-y-8">
                {stack.map((id) => renderBlock(id))}
              </div>
            ))}
          </div>
        )
        // No header / margin: the grid div is the row (byte-identical to before, keyed on the row id). With
        // either, wrap the grid in a <section> that carries the heading and / or the margin.
        if (!wrap) {
          return (
            <div key={row.id} className={`grid gap-8 ${columnsClass(row.columns, row.ratio)}`}>
              {row.cells.map((stack, i) => (
                <div key={`${row.id}-${i}`} className="@container space-y-8">
                  {stack.map((id) => renderBlock(id))}
                </div>
              ))}
            </div>
          )
        }
        return (
          <section key={row.id} className={mCls || undefined}>
            {showHeader && <RowHeader title={row.title!} />}
            {grid}
          </section>
        )
      })}
    </div>
  )
}

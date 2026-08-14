import { Check, ChevronDown, Minus } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE COMPARISON TABLE for the marketing surface.
//
// /pricing carried TWO of these. `ComparisonBlock` + `Cell` (declared inline in the page) drew the
// plan matrix; `PricingComparison` drew the value ledger with its own table, its own head band, its
// own group subhead, its own mobile stack. They had already drifted: two group-subhead treatments,
// two row-divider rules, and one of the two wrapped its table in `overflow-hidden` instead of
// `overflow-x-auto`, so a wide value table clipped its own last column rather than scrolling
// (PAGE-FRAMEWORK: wide content scrolls inside its own container, the page body never does).
//
// Both are now one component over one normalized shape. What genuinely differs is not the chrome
// but how a PHONE should read the thing, so that is the one prop:
//
//   · `mobile="by-column"` — a plan MATRIX (N priced columns × feature rows). A phone reads it one
//     plan at a time, so each column collapses into a <details> listing every row for that plan.
//   · `mobile="by-row"`    — a value LEDGER (few fixed columns, the row is the unit). A phone reads
//     it one feature at a time, so each group becomes a card and each row keeps its cells beside it.
//
// A single mobile mode would make one of the two unreadable, which is why this is a prop and not a
// second component. Everything else — the scroll container, the head band, the group subhead, the
// dividers, the featured tint, and the yes/no/value cell vocabulary — is shared.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** How a cell reads: a plain yes, a plain no, or a value (an allowance, a rate, a price). */
export type ComparisonCellKind = 'yes' | 'no' | 'value'

export interface ComparisonCell {
  kind: ComparisonCellKind
  /** What the cell reads. Always a full phrase, so a screen-reader row makes sense on its own. */
  text: React.ReactNode
  /** An optional quiet line ABOVE the value (the name of the tool a price belongs to). */
  lead?: React.ReactNode
  /** An optional caveat BELOW the value (per seat, plus fees). */
  sub?: React.ReactNode
}

export interface ComparisonColumn {
  id: string
  label: string
  /** Rendered under the column label in the head band (a price, a crossed-out anchor). */
  note?: React.ReactNode
  /** Rendered beside the column label on a `by-column` mobile accordion summary. */
  summary?: React.ReactNode
  /** The one column the page highlights: a faint tint down the header and its cells. */
  emphasis?: boolean
  align?: 'left' | 'right'
}

export interface ComparisonRow {
  key: string
  label: React.ReactNode
  /** One plain line on what the capability actually is, under the label. */
  detail?: React.ReactNode
  /** Aligned by index to `columns`. */
  cells: ComparisonCell[]
}

export interface ComparisonGroup {
  key: string
  label: string
  rows: ComparisonRow[]
}

/** One resolved cell. A yes reads as a check, a no as a muted dash with its reason, a value plainly.
 *  The text is always present, so the icons are decoration and the row still reads aloud. */
export function ComparisonCellText({ cell }: { cell: ComparisonCell }) {
  const body =
    cell.kind === 'yes' ? (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {cell.text}
      </span>
    ) : cell.kind === 'no' ? (
      <span className="inline-flex items-center gap-1.5 text-subtle">
        <Minus className="h-4 w-4 shrink-0" aria-hidden />
        {cell.text}
      </span>
    ) : (
      <span className="font-semibold text-text">{cell.text}</span>
    )

  if (!cell.lead && !cell.sub) return body
  return (
    <span className="block">
      {cell.lead && <span className="block font-normal text-muted">{cell.lead}</span>}
      <span className={cell.lead ? 'mt-1 block' : 'block'}>{body}</span>
      {cell.sub && <span className="mt-1 block text-meta font-normal text-subtle">{cell.sub}</span>}
    </span>
  )
}

const alignOf = (column: ComparisonColumn) => (column.align === 'right' ? 'text-right' : '')
const tintOf = (column: ComparisonColumn, strength: 'head' | 'body') =>
  column.emphasis ? (strength === 'head' ? 'bg-primary-bg/30' : 'bg-primary-bg/15') : ''

export function ComparisonTable({
  caption,
  rowHeader,
  columns,
  groups,
  footer,
  mobile = 'by-column',
  openId,
}: {
  /** The screen-reader caption. The visible heading is the page's job (`BlockHeading`). */
  caption: string
  /** The head cell over the row-label column ("Feature", "What you get"). */
  rowHeader: string
  columns: ComparisonColumn[]
  groups: ComparisonGroup[]
  /** An optional totals row, drawn heavier under the body (and as a highlighted card on mobile). */
  footer?: ComparisonRow
  mobile?: 'by-column' | 'by-row'
  /** `by-column` only: which column's accordion starts open. */
  openId?: string
}) {
  return (
    <div>
      {mobile === 'by-column' ? (
        <MobileByColumn columns={columns} groups={groups} openId={openId} />
      ) : (
        <MobileByRow columns={columns} groups={groups} footer={footer} />
      )}

      {/* Desktop: the real table, scrolling inside its OWN container so wide content never makes
          the page body scroll sideways.

          🔴 `bg-surface` IS LOAD-BEARING, not decoration. The table paints no background of its own,
          so on a `canvas` band (the value ledger) every cell inherited `--color-marketing-canvas`,
          and `--color-success` — the "Included" tick — measures 4.05:1 there (3.80:1 on Midnight)
          against the 4.5 body minimum. The identical cell on a `surface` band (the plan matrix, and
          the `by-column` phone stack below, which already carries `bg-surface`) measures 4.67:1 and
          passes. The token gate cannot see this: it validates `success on surface`, and no pair in
          its table puts a status tone on the canvas. So the table declares the surface it was
          measured against instead of inheriting whichever band it lands on. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface lg:block">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="w-64 px-5 py-4 align-bottom text-body-sm font-bold text-text">
                {rowHeader}
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`px-5 py-4 align-bottom ${alignOf(column)} ${tintOf(column, 'head')}`}
                >
                  <span className="block font-display uppercase text-text text-lead">{column.label}</span>
                  {column.note && <span className="mt-1 block normal-case">{column.note}</span>}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key} className="text-body-sm">
              <tr className="border-b border-border bg-surface-elevated/60">
                <th
                  scope="colgroup"
                  colSpan={columns.length + 1}
                  className="px-5 py-2 text-2xs font-black uppercase tracking-eyebrow text-muted"
                >
                  {group.label}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <th scope="row" className="px-5 py-3 align-top font-semibold text-text">
                    {row.label}
                    {row.detail && (
                      <span className="mt-0.5 block text-meta font-normal leading-relaxed text-subtle">
                        {row.detail}
                      </span>
                    )}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={columns[i]!.id}
                      className={`px-5 py-3 align-top ${alignOf(columns[i]!)} ${tintOf(columns[i]!, 'body')}`}
                    >
                      <ComparisonCellText cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          {footer && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-elevated">
                <th scope="row" className="px-5 py-5 align-top">
                  <span className="block font-display uppercase text-text text-lead">{footer.label}</span>
                  {footer.detail && (
                    <span className="mt-0.5 block text-meta font-normal text-subtle">{footer.detail}</span>
                  )}
                </th>
                {footer.cells.map((cell, i) => (
                  <td
                    key={columns[i]!.id}
                    className={`px-5 py-5 align-top ${alignOf(columns[i]!)} ${tintOf(columns[i]!, 'body')}`}
                  >
                    <ComparisonCellText cell={cell} />
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

/** A plan MATRIX on a phone: one collapsible per priced column, each listing every group and row. */
function MobileByColumn({
  columns,
  groups,
  openId,
}: {
  columns: ComparisonColumn[]
  groups: ComparisonGroup[]
  openId?: string
}) {
  return (
    <div className="space-y-3 lg:hidden">
      {columns.map((column, i) => (
        <details
          key={column.id}
          open={column.id === openId}
          className="group rounded-2xl border border-border bg-surface [&_summary]:list-none"
        >
          <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-5 py-4">
            <span className="font-display uppercase text-text text-lead">{column.label}</span>
            <span className="flex items-center gap-2">
              {column.summary && (
                <span className="text-body-sm font-bold text-primary-strong">{column.summary}</span>
              )}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180"
                aria-hidden
              />
            </span>
          </summary>
          <div className="border-t border-border px-5 pb-5 pt-2">
            {groups.map((group) => (
              <div key={group.key} className="mt-4 first:mt-2">
                <h4 className="mb-2 text-2xs font-black uppercase tracking-eyebrow text-muted">
                  {group.label}
                </h4>
                <dl className="space-y-2">
                  {group.rows.map((row) => (
                    // `min-w-0` on BOTH sides, never `shrink-0` on the value. A `shrink-0` value
                    // is a promise the row cannot keep once an allowance sentence lands in it:
                    // "3 seats included, add more per seat" measures 241px, which on a 320px card
                    // (minus px-5 and the gap) has nowhere to go, so the row pushed the whole
                    // /pricing page into a horizontal scroll (measured 366px on a 360px screen).
                    // Both cells wrap instead; `text-right` keeps the ledger reading as a ledger.
                    <div key={row.key} className="flex items-start justify-between gap-4">
                      <dt className="min-w-0 text-body-sm text-muted">{row.label}</dt>
                      <dd className="min-w-0 text-right text-body-sm">
                        <ComparisonCellText cell={row.cells[i]!} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

/** A value LEDGER on a phone: one card per group, each row keeping its cells beside it. */
function MobileByRow({
  columns,
  groups,
  footer,
}: {
  columns: ComparisonColumn[]
  groups: ComparisonGroup[]
  footer?: ComparisonRow
}) {
  return (
    <div className="space-y-6 lg:hidden">
      {groups.map((group) => (
        // `bg-surface` for the same reason the desktop table carries it: a `yes` cell's
        // `text-success` clears 4.5:1 on the surface tone and misses it on the canvas tone.
        <div key={group.key} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <p className="border-b border-border bg-surface-elevated px-4 py-3 font-display uppercase text-text">
            {group.label}
          </p>
          <ul className="divide-y divide-border">
            {group.rows.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{row.label}</p>
                  {row.detail && <p className="mt-0.5 text-meta text-muted">{row.detail}</p>}
                </div>
                {/* `min-w-0`, not `shrink-0` — same reason as the by-column ledger above. The
                    card carries `overflow-hidden`, so here an unshrinkable value column did not
                    scroll the page, it silently CLIPPED the end of the longest allowance line. */}
                <div className="flex min-w-0 flex-col items-end gap-1 text-right text-body-sm">
                  {row.cells.map((cell, i) => (
                    <ComparisonCellText key={columns[i]!.id} cell={cell} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {footer && (
        <div className="rounded-2xl border-2 border-primary bg-primary-bg/20 p-5 text-center">
          <p className="font-display uppercase text-text text-lead">{footer.label}</p>
          {footer.detail && <p className="mt-1 text-body-sm text-subtle">{footer.detail}</p>}
          <dl className="mt-4 space-y-3">
            {footer.cells.map((cell, i) => (
              <div key={columns[i]!.id}>
                <dt className="text-2xs font-black uppercase tracking-eyebrow text-muted">
                  {columns[i]!.label}
                </dt>
                <dd className="mt-1">
                  <ComparisonCellText cell={cell} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

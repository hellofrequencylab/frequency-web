import { Fragment } from 'react'
import Link from 'next/link'

// The canonical operator table (ADR-233 §4). SERVER-SAFE and presentational: no
// `'use client'`, no hooks — so a Server Component can render it directly, calling the
// `render`/`rowActions`/`rowHref` functions on the SERVER (passing functions across the
// server→client boundary throws at request time, which is the bug this fixes). Cells,
// row actions (revealed on hover via CSS), and the row link are all server-rendered;
// `render` may return Client Components (StatusChip, etc.) — that's fine.
//
// Data ownership, the RSC way: the PAGE sorts/filters/paginates server-side (read the
// `?sort`/filter params, order the query) and passes the ready rows in. A column's
// `sortable` flag is a marker only — make its `header` a `<Link>` to `?sort=key` if you
// want a sort affordance; there is no client sort here. Row selection / bulk actions, if
// ever needed, belong in a small Client wrapper around this table (none use it today).
//
//   <DataTable rows={members} getRowId={m=>m.id} rowHref={m=>`/admin/members/${m.id}`}
//     caption="Members"
//     columns={[
//       { key:'name', header:'Name', render:m=><b>{m.name}</b> },
//       { key:'role', header:'Role', render:m=><StatusChip>{m.role}</StatusChip> },
//       { key:'zaps', header:'Zaps', type:'number' },
//     ]}
//     rowActions={m=><RowLinks id={m.id} />}
//     empty={<EmptyState variant="no-results" title="No members match." />} />

export interface ColumnDef<T> {
  key: string
  header: React.ReactNode
  /** Cell renderer; defaults to `row[key]`. Called on the server. */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  type?: 'text' | 'number' | 'tag' | 'date' | 'currency' | 'boolean' | 'avatar' | 'actions'
  /** Marker only — sorting is server-owned (the page orders the data). Make the
   *  `header` a `<Link href="?sort=key">` for the affordance. */
  sortable?: boolean
}

const PAD = { comfortable: 'px-4 py-3.5', compact: 'px-3 py-2' } as const
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowHref,
  rowActions,
  stickyHeader = false,
  density = 'comfortable',
  caption,
  empty,
  expandedRowId,
  expandedRow,
}: {
  columns: ColumnDef<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Whole-row navigation: the first cell becomes a link to this href. */
  rowHref?: (row: T) => string
  /** Trailing actions cell, revealed on hover (server-rendered; use links / server-action forms). */
  rowActions?: (row: T) => React.ReactNode
  stickyHeader?: boolean
  density?: 'comfortable' | 'compact'
  /** Accessible table summary (visually hidden). */
  caption: string
  /** Shown instead of the table when there are no rows. */
  empty?: React.ReactNode
  /** Inline-edit / detail panel: when a row's id matches, render `expandedRow(row)` beneath it. */
  expandedRowId?: string
  expandedRow?: (row: T) => React.ReactNode
}) {
  if (rows.length === 0 && empty) return <>{empty}</>

  const pad = PAD[density]
  const colSpan = columns.length + (rowActions ? 1 : 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="border-b border-border bg-surface-elevated/50 text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`${pad} text-xs font-semibold uppercase tracking-wide text-muted ${ALIGN[c.align ?? 'left']}`}
                >
                  {c.header}
                </th>
              ))}
              {rowActions && <th scope="col" className={`${pad} w-12`} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => {
              const id = getRowId(row)
              const href = rowHref?.(row)
              return (
                <Fragment key={id}>
                  <tr className="group hover:bg-surface-elevated/40">
                    {columns.map((c, ci) => {
                      const content = c.render
                        ? c.render(row)
                        : ((row as Record<string, React.ReactNode>)[c.key] ?? null)
                      const isNum = c.type === 'number' || c.type === 'currency'
                      return (
                        <td
                          key={c.key}
                          className={`${pad} text-text ${ALIGN[c.align ?? (isNum ? 'right' : 'left')]} ${isNum ? 'tabular-nums' : ''}`}
                        >
                          {href && ci === 0 ? (
                            <Link href={href} className="font-medium hover:underline">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      )
                    })}
                    {rowActions && (
                      <td className={`${pad} text-right`}>
                        <div className="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
                          {rowActions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                  {expandedRow && expandedRowId === id && (
                    <tr>
                      <td colSpan={colSpan} className="border-t border-border/60 bg-surface-elevated/30 px-4 py-3">
                        {expandedRow(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

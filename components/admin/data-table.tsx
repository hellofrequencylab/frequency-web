'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The canonical operator table (ADR-233 §4, Polaris/Geist/Retool/Catalyst). One table
// contract everywhere: typed columns, row-as-link navigation, hover row actions,
// checkbox selection that survives re-render (keyed by id) feeding promoted + overflow
// bulk actions, sticky header, a density toggle, a11y caption, and an empty slot. Sort
// state lives in the URL (?sort & ?dir) so the SERVER owns the data and the view is
// shareable. Rows are passed in already-sorted/filtered/paged by the server; beyond a
// few thousand rows, push filter/sort into the query. For dense spreadsheet bulk-edit
// (virtualization, copy/paste) reach for a data-grid instead — this is the 90% table.
//
//   <DataTable rows={members} getRowId={m=>m.id} rowHref={m=>`/admin/members/${m.id}`}
//     caption="Members" selectable
//     bulkActions={[{ label:'Archive', icon:Archive, onAction:archiveMany }]}
//     columns={[
//       { key:'name', header:'Name', render:m=><b>{m.name}</b> },
//       { key:'role', header:'Role', render:m=><StatusChip>{m.role}</StatusChip> },
//       { key:'zaps', header:'Zaps', type:'number', sortable:true },
//     ]}
//     rowActions={m=><RowMenu id={m.id} />}
//     empty={<EmptyState variant="no-results" title="No members match." />} />

export interface ColumnDef<T> {
  key: string
  header: React.ReactNode
  /** Cell renderer; defaults to `row[key]`. */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  /** Sortable header → writes ?sort=key&dir to the URL (server re-renders). */
  sortable?: boolean
  width?: string
  type?: 'text' | 'number' | 'tag' | 'date' | 'currency' | 'boolean' | 'avatar' | 'actions'
}

export interface BulkAction {
  label: string
  icon?: LucideIcon
  onAction: (ids: string[]) => void
  tone?: 'default' | 'danger'
}

const PAD = { comfortable: 'px-4 py-3.5', compact: 'px-3 py-2' } as const
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowHref,
  rowActions,
  selectable = false,
  bulkActions = [],
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
  rowHref?: (row: T) => string
  rowActions?: (row: T) => React.ReactNode
  selectable?: boolean
  bulkActions?: BulkAction[]
  stickyHeader?: boolean
  density?: 'comfortable' | 'compact'
  caption: string
  empty?: React.ReactNode
  /** Inline-edit / detail panel: when a row's id matches, `expandedRow(row)` renders in
   *  a full-width row beneath it (the page owns which row is open). */
  expandedRowId?: string
  expandedRow?: (row: T) => React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overflowOpen, setOverflowOpen] = useState(false)

  const sortKey = params.get('sort')
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc'

  function setSort(key: string) {
    const next = new URLSearchParams(params.toString())
    const dir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'
    next.set('sort', key)
    next.set('dir', dir)
    router.push(`${pathname}?${next.toString()}`)
  }

  const allIds = rows.map(getRowId)
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selected.has(id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pad = PAD[density]
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)
  const ids = [...selected]
  const promoted = bulkActions.slice(0, 2)
  const overflow = bulkActions.slice(2)

  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Bulk-action bar — appears when rows are selected. Promoted inline + overflow. */}
      {selectable && ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-bg/60 px-4 py-2.5">
          <span className="text-sm font-semibold text-text">{ids.length} selected</span>
          <div className="ml-auto flex items-center gap-2">
            {promoted.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onAction(ids)
                  setSelected(new Set())
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  a.tone === 'danger'
                    ? 'text-danger hover:bg-danger-bg'
                    : 'text-text hover:bg-surface-elevated'
                }`}
              >
                {a.icon && <a.icon className="h-3.5 w-3.5" aria-hidden />}
                {a.label}
              </button>
            ))}
            {overflow.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="More actions"
                  onClick={() => setOverflowOpen((v) => !v)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
                {overflowOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 min-w-40 rounded-xl border border-border bg-surface py-1 shadow-lg">
                    {overflow.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          a.onAction(ids)
                          setSelected(new Set())
                          setOverflowOpen(false)
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-elevated ${
                          a.tone === 'danger' ? 'text-danger' : 'text-text'
                        }`}
                      >
                        {a.icon && <a.icon className="h-4 w-4 shrink-0" aria-hidden />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="border-b border-border bg-surface-elevated/50 text-left">
              {selectable && (
                <th scope="col" className={`${pad} w-10`}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sortKey === c.key
                const SortIcon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    className={`${pad} text-xs font-semibold uppercase tracking-wide text-muted ${ALIGN[c.align ?? 'left']}`}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => setSort(c.key)}
                        className={`inline-flex items-center gap-1 hover:text-text ${active ? 'text-text' : ''}`}
                      >
                        {c.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
              {rowActions && <th scope="col" className={`${pad} w-12`} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => {
              const id = getRowId(row)
              const href = rowHref?.(row)
              return (
                <Fragment key={id}>
                <tr
                  className={`group ${href ? 'cursor-pointer' : ''} ${selected.has(id) ? 'bg-primary-bg/30' : 'hover:bg-surface-elevated/40'}`}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  {selectable && (
                    <td className={pad} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(id)}
                        onChange={() => toggleOne(id)}
                        className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30"
                      />
                    </td>
                  )}
                  {columns.map((c, ci) => {
                    const content = c.render ? c.render(row) : ((row as Record<string, React.ReactNode>)[c.key] ?? null)
                    const isNum = c.type === 'number' || c.type === 'currency'
                    return (
                      <td
                        key={c.key}
                        className={`${pad} text-text ${ALIGN[c.align ?? (isNum ? 'right' : 'left')]} ${isNum ? 'tabular-nums' : ''}`}
                      >
                        {/* First cell carries a real link for keyboard/right-click when the row navigates. */}
                        {href && ci === 0 ? (
                          <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    )
                  })}
                  {rowActions && (
                    <td className={`${pad} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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

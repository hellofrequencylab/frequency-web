'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { EntityBlockDef } from '@/lib/entity-blocks/registry'

// THE SEARCHABLE BLOCK PICKER (ADR-516 Phase C). A command-list that fills an empty column slot: it lists
// the member blocks from the registry that are NOT already placed (or hidden), grouped "Suggested" (the
// handful the page still lacks, in default order) then "All". Typing filters both groups by label +
// description. Selecting a block inserts it into the slot the picker was opened for. Rail-sized, semantic
// DAWN tokens, no hex, voice canon (no em dashes). Keyboard: the search field autofocuses; every option is
// a real <button>, so Tab/Enter work; Escape closes.

const SUGGESTED_COUNT = 4

/** Split the AVAILABLE blocks (palette minus already-taken) into Suggested + All, filtered by `query`.
 *  PURE + exported so the exclusion + grouping is unit-testable without a DOM. */
export function filterPickerBlocks(
  palette: EntityBlockDef[],
  taken: ReadonlySet<string>,
  query: string,
): { suggested: EntityBlockDef[]; all: EntityBlockDef[] } {
  const available = palette.filter((b) => !taken.has(b.id))
  const q = query.trim().toLowerCase()
  const matches = q
    ? available.filter(
        (b) => b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
      )
    : available
  // No query: a small Suggested set leads, the rest go under All. With a query: one flat "All" result set
  // (no split), so a search reads as a single list.
  if (q) return { suggested: [], all: matches }
  return { suggested: matches.slice(0, SUGGESTED_COUNT), all: matches.slice(SUGGESTED_COUNT) }
}

export function BlockPicker({
  palette,
  taken,
  onPick,
  onClose,
}: {
  /** Every arrangeable block for the kind, in default order. */
  palette: EntityBlockDef[]
  /** Block ids already placed or hidden — excluded from the list. */
  taken: ReadonlySet<string>
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const { suggested, all } = useMemo(() => filterPickerBlocks(palette, taken, query), [palette, taken, query])
  const empty = suggested.length === 0 && all.length === 0

  const option = (b: EntityBlockDef) => (
    <button
      key={b.id}
      type="button"
      onClick={() => onPick(b.id)}
      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-primary-bg focus:bg-primary-bg focus:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{b.label}</span>
        <span className="mt-0.5 block text-xs text-muted">{b.description}</span>
      </span>
    </button>
  )

  const group = (label: string, blocks: EntityBlockDef[]) =>
    blocks.length > 0 ? (
      <div className="space-y-0.5">
        <p className="px-2.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
        {blocks.map(option)}
      </div>
    ) : null

  return (
    <div className="rounded-xl border border-border bg-surface p-2 shadow-sm" role="dialog" aria-label="Add a block">
      <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Search blocks"
          aria-label="Search blocks"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text placeholder:text-subtle focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md p-1 text-subtle hover:text-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {empty ? (
          <p className="px-2.5 py-3 text-xs text-muted">Every block is already on your page.</p>
        ) : (
          <>
            {group('Suggested', suggested)}
            {group(query.trim() ? 'Results' : 'All', all)}
          </>
        )}
      </div>
    </div>
  )
}

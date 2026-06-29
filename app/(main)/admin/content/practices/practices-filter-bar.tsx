'use client'

// The collapsible container for the library filters (owner fix, ADR-438). The filter CONTROLS
// stay exactly as they were (practices-controls.tsx, URL-driven); this only changes WHERE they
// live: a full-width disclosure above the table instead of a 15rem left rail that squeezed the
// columns. Collapsed by default with an active-filter count, so the table gets the whole column
// and the operator opens the filters when they need them. Reads the same search params the
// controls write, so the badge count and the open/closed default stay in sync with the URL.

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidersHorizontal, ChevronDown } from 'lucide-react'

// The filter params the bar summarizes (matches practices-controls' FILTER_KEYS, minus sort/dir,
// which are their own control above the table, not "filters").
const FILTER_PARAMS = [
  'q', 'pillar', 'sub', 'status', 'weight', 'creator', 'tag',
  'public', 'template', 'featured', 'noImage', 'noBody', 'neverLogged', 'noPillar',
] as const

export function PracticesFilterDisclosure({
  children,
  clear,
}: {
  children: React.ReactNode
  clear: React.ReactNode
}) {
  const sp = useSearchParams()
  const activeCount = FILTER_PARAMS.reduce((n, k) => n + (sp.get(k) ? 1 : 0), 0)

  // Open by default when a filter is already applied (so a shared/saved-view link shows what is
  // filtering the table); otherwise collapsed to give the table the full width.
  const [open, setOpen] = useState(activeCount > 0)
  // Keep the open state honest if the URL changes from elsewhere (Clear, a saved view) without an
  // effect: the store-the-previous-value pattern (react.dev "you might not need an effect").
  const [seenCount, setSeenCount] = useState(activeCount)
  if (activeCount !== seenCount) {
    setSeenCount(activeCount)
    if (activeCount > 0) setOpen(true)
  }

  return (
    <section aria-label="Library filters" className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-bold tracking-tight text-text transition-colors hover:text-primary-strong"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-primary-strong">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className="ml-auto">{clear}</div>
      </div>
      {open && <div className="border-t border-border px-3 py-3">{children}</div>}
    </section>
  )
}

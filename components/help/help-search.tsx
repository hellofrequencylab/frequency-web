'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'

// Client-side help search over a static index passed from the server. No backend,
// no search SaaS: a lightweight scored substring match, owned and instant (scoring
// shared via lib/help/search). The index is small; if it ever grows large we can
// swap the impl there without touching callers (see docs/HELP-CENTER.md).
export function HelpSearch({ index }: { index: HelpSearchEntry[] }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => searchHelp(index, q), [q, index])

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search help..."
        aria-label="Search help articles"
        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-border-strong)]"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg">
          {results.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                onClick={() => setQ('')}
                className="block px-3 py-2 hover:bg-surface"
              >
                <span className="block text-sm font-medium text-text">{r.title}</span>
                <span className="block text-xs text-muted">{r.categoryTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && results.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-muted shadow-lg">
          No results for &ldquo;{q}&rdquo;.
        </p>
      )}
    </div>
  )
}

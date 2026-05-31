'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { HelpSearchEntry } from '@/lib/help/content'

// Client-side help search over a static index passed from the server. No backend,
// no search SaaS: a lightweight scored substring match, owned and instant. The
// index is small; if it ever grows large we can swap in Pagefind/Orama behind
// this same component without touching callers (see docs/HELP-CENTER.md).
function score(entry: HelpSearchEntry, q: string): number {
  const hay = `${entry.title} ${entry.description} ${entry.categoryTitle} ${entry.excerpt}`.toLowerCase()
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  let s = 0
  for (const t of terms) {
    if (entry.title.toLowerCase().includes(t)) s += 5
    else if (hay.includes(t)) s += 1
    else return 0
  }
  return s
}

export function HelpSearch({ index }: { index: HelpSearchEntry[] }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const query = q.trim()
    if (query.length < 2) return []
    return index
      .map((e) => ({ e, s: score(e, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((r) => r.e)
  }, [q, index])

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search help..."
        aria-label="Search help articles"
        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
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

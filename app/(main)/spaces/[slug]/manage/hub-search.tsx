'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ArrowRight } from 'lucide-react'

// The Space hub SEARCH bar (ADR-785): a fast finder over every tool + setting in the Manage hub, sitting
// under the header rule. Client-side + instant — type part of a name ("tickets", "email", "plan") and jump
// straight to that surface, without hunting through the categories. Token-clean; keyboard accessible.

export interface HubSearchItem {
  /** The tool / setting name. */
  label: string
  /** Where it opens. */
  href: string
  /** The category it lives under, shown as a quiet suffix so a match is legible. */
  section: string
}

export function HubSearch({ items }: { items: HubSearchItem[] }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return []
    return items.filter((it) => it.label.toLowerCase().includes(q) || it.section.toLowerCase().includes(q)).slice(0, 8)
  }, [items, q])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm focus-within:border-border-strong">
        <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this space's tools and settings"
          aria-label="Search this space's tools and settings"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
        />
      </div>
      {q && (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {matches.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {matches.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="group flex items-center gap-2 px-3 py-2 text-sm outline-none transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated"
                  >
                    <span className="flex-1 truncate font-medium text-text">{it.label}</span>
                    <span className="shrink-0 text-2xs uppercase tracking-wide text-subtle">{it.section}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted">No tool matches &ldquo;{query}&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  )
}

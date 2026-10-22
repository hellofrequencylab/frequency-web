'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { findCardPages, type CardPage } from '@/lib/member-cards/actions'

// FIND A PAGE for a card's "Open my link" (LIVE-1301). Searches as you type for any public page on the
// site (a Space, an event, a Journey, a person, an offer or a feature), the same search the console's
// tags use, and hands the chosen page's full link to the editor's link field. Anything else is pasted
// into that field. Only the newest answer is kept. Copy obeys CONTENT-VOICE.

export function CardLinkPicker({ onPick, disabled }: { onPick: (url: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CardPage[] | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    const mine = ++seq.current
    if (q.length < 2) return
    const t = window.setTimeout(() => {
      void findCardPages(q).then((out) => {
        if (mine !== seq.current) return
        setResults('error' in out ? [] : out.data)
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [query])

  const shown = query.trim().length < 2 ? null : results

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          aria-label="Find a page on Frequency"
          placeholder="Find a page: a Space, event, Journey, person or offer"
          className="pl-9"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown && shown.length === 0 && <p className="text-meta text-muted">No pages match. Paste the link below instead.</p>}
      {shown && shown.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-card border border-border bg-surface p-1">
          {shown.map((p) => (
            <li key={p.url}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-control px-2 py-1.5 text-left hover:bg-surface-elevated focus-visible:bg-surface-elevated"
                onClick={() => {
                  onPick(p.url)
                  setQuery('')
                  setResults(null)
                }}
              >
                <span className="mt-0.5 shrink-0 rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">{p.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-medium text-text">{p.label}</span>
                  {p.detail && <span className="block truncate text-meta text-muted">{p.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

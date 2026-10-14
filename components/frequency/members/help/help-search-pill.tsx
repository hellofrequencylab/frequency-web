'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { Input } from '@/components/ui/field'
import { openSupport } from '@/components/support/support-launcher'

// The reference's search pill (Help.html) over the same owned index and scoring as the help centre's
// sidebar search (lib/help/search). Client-side, instant, no backend. Escape clears it; a search with
// no match says so and hands the question to a person (the support dialog) instead of a dead end.
export function HelpSearchPill({ index }: { index: HelpSearchEntry[] }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => searchHelp(index, q), [q, index])
  const asked = q.trim().length >= 2

  return (
    <div className="mc-help-search">
      <label className="row mc-pill">
        <FqIcon name="search" className="mc-muted" />
        <Input
          variant="seamless"
          type="search"
          className="grow mc-pill-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQ('')
          }}
          placeholder="Search help"
          aria-label="Search help articles"
          aria-controls="mc-help-results"
        />
      </label>
      <p className="sr-only" role="status">
        {asked ? (results.length > 0 ? `${results.length} ${results.length === 1 ? 'guide' : 'guides'} found` : 'No guides found') : ''}
      </p>
      {results.length > 0 ? (
        <div id="mc-help-results" className="panel list mc-results">
          {results.map((r) => (
            <Link key={r.href} href={r.href} onClick={() => setQ('')}>
              <span className="grow">
                <span className="t1 mc-block">{r.title}</span>
                <span className="t2">{r.categoryTitle}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : asked ? (
        <div id="mc-help-results" className="panel stack mc-results mc-gap-8">
          <span className="t1">Nothing in the guides for that.</span>
          <span className="t2">Ask a person instead. The answer lands in your reports below.</span>
          <button type="button" className="btn sm pa mc-self-start" onClick={() => openSupport('question')}>
            Ask support
          </button>
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { Input } from '@/components/ui/field'

// The reference's search pill (Help.html) over the same owned index and scoring as the help centre's
// sidebar search (lib/help/search). Client-side, instant, no backend.
export function HelpSearchPill({ index }: { index: HelpSearchEntry[] }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => searchHelp(index, q), [q, index])

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
          placeholder="Search help"
          aria-label="Search help articles"
        />
      </label>
      {results.length > 0 && (
        <div className="panel list mc-results">
          {results.map((r) => (
            <Link key={r.href} href={r.href} onClick={() => setQ('')}>
              <span className="grow">
                <span className="t1 mc-block">{r.title}</span>
                <span className="t2">{r.categoryTitle}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

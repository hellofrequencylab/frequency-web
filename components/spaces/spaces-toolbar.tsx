'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'
import { DIRECTORY_TYPES } from './space-type'

// The command bar for the Spaces directory — the same standard the Circles/People directories use:
// a debounced free-text search (DirectorySearch) plus a low-cardinality TYPE filter as a pill row
// (five values: Practitioner / Business / Organization / Coaching / Event Space). Everything is
// URL-driven (writes the `q` / `type` params, preserves the rest), so the page stays a Server
// Component and a filtered view is shareable. URL state IS the filter; no local state.
export function SpacesToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const type = params.get('type') ?? ''

  function setType(next: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (next) sp.set('type', next)
    else sp.delete('type')
    const s = sp.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface hover:text-text'
    }`

  return (
    <div className="space-y-3">
      <DirectorySearch placeholder="Search Spaces by name…" />

      {/* Type filter — low-cardinality, so pills (matches the Circles directory standard). The pill
          row scrolls horizontally on a narrow screen rather than wrapping into the search box. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          <button type="button" onClick={() => setType(null)} className={pill(!type)}>
            <LayoutGrid className="h-3.5 w-3.5" /> All
          </button>
          {DIRECTORY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={pill(type === t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

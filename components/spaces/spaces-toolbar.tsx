'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, Check } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'
import { DIRECTORY_TYPES } from './space-type'

// The command bar for the Spaces directory — the same standard the Circles/People directories use:
// a debounced free-text search (DirectorySearch) plus a low-cardinality TYPE filter as a pill row
// (five values: Practitioner / Business / Organization / Coaching / Event Space), and a "Following"
// pill that narrows to the Spaces the viewer follows. Everything is URL-driven (writes the `q` /
// `type` / `following` params, preserves the rest), so the page stays a Server Component and a
// filtered view is shareable. URL state IS the filter; no local state.
export function SpacesToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const type = params.get('type') ?? ''
  const following = params.get('following') === '1'

  function setType(next: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (next) sp.set('type', next)
    else sp.delete('type')
    const s = sp.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  function toggleFollowing() {
    const sp = new URLSearchParams(params.toString())
    if (following) sp.delete('following')
    else sp.set('following', '1')
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

      {/* Facet row: the low-cardinality TYPE pills (matches the Circles directory standard) plus a
          standalone "Following" pill. The row scrolls horizontally on a narrow screen rather than
          wrapping into the search box. */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1">
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

        {/* "Following" narrows to the Spaces the viewer follows (URL `?following=1`). A separate
            facet from type, so it sits in its own pill group. */}
        <div className="flex w-max items-center rounded-lg bg-surface-elevated p-0.5">
          <button
            type="button"
            onClick={toggleFollowing}
            aria-pressed={following}
            className={pill(following)}
          >
            <Check className="h-3.5 w-3.5" /> Following
          </button>
        </div>
      </div>
    </div>
  )
}

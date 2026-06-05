'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MapPin, Globe, Users } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'
import { FacetDropdown } from '@/components/ui/facet-dropdown'

type Interest = { id: string; name: string }

const SORTS = [
  { key: 'nearest', label: 'Nearest' },
  { key: 'active', label: 'Busiest' },
  { key: 'new', label: 'Newest' },
  { key: 'open', label: 'Open spots' },
] as const

// Faceted command bar for the Circles surface — the same standard the Directory
// uses: a debounced free-text search (DirectorySearch), high-cardinality facets as
// searchable dropdowns (FacetDropdown), low-cardinality as pills (type), and sort
// as a native select. Everything URL-driven so a filtered view is shareable and
// the page stays a server component.
export function CirclesToolbar({ interests }: { interests: Interest[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const type = params.get('type') ?? ''
  const sort = params.get('sort') ?? 'nearest'

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k)
      else sp.set(k, v)
    }
    const s = sp.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface hover:text-text'
    }`

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <DirectorySearch placeholder="Search circles by name, place, or interest…" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <FacetDropdown
            label="Interest"
            paramKey="interest"
            align="right"
            options={interests.map((i) => ({ value: i.id, label: i.name }))}
          />
          {/* Sort is ordering, not a facet — a native select stays clearest. */}
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm font-medium text-muted focus:border-border-strong focus:outline-none"
            aria-label="Sort circles"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Type pills */}
      <div className="flex w-fit items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
        <button type="button" onClick={() => update({ type: null })} className={pill(!type)}>
          <Users className="h-3.5 w-3.5" /> All
        </button>
        <button type="button" onClick={() => update({ type: 'in-person' })} className={pill(type === 'in-person')}>
          <MapPin className="h-3.5 w-3.5" /> In person
        </button>
        <button type="button" onClick={() => update({ type: 'online' })} className={pill(type === 'online')}>
          <Globe className="h-3.5 w-3.5" /> Online
        </button>
      </div>
    </div>
  )
}

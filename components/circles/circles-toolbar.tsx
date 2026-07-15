'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MapPin, Globe, Users, ArrowUpDown } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'

const SORTS = [
  { key: 'nearest', label: 'Nearest' },
  { key: 'active', label: 'Busiest' },
  { key: 'new', label: 'Newest' },
  { key: 'open', label: 'Open spots' },
] as const

const TYPES = [
  { key: '', label: 'All', Icon: Users },
  { key: 'in-person', label: 'In person', Icon: MapPin },
  { key: 'online', label: 'Online', Icon: Globe },
] as const

// Compact command bar for Circles: free-text search, a segmented format toggle (All /
// In person / Online), and sort — all on ONE row. The Channel category lives in the
// pillar pills above (CirclesChannelNav) and granular Channels in the Browse rail, so the
// bar stays tight and unduplicated. URL-driven, so a filtered view is shareable and the
// page stays a server component. `showSearch` drops the search box when the surface carries
// search elsewhere (the Circles index now puts it in the shared hero header), leaving just the
// format toggle + sort so the two search inputs never duplicate.
export function CirclesToolbar({ showSearch = true }: { showSearch?: boolean } = {}) {
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

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {showSearch ? (
        <div className="min-w-0 flex-1">
          <DirectorySearch placeholder="Search circles by name or place…" />
        </div>
      ) : (
        // Search lives in the hero header on the Circles index; keep the controls pushed right.
        <div className="min-w-0 flex-1" aria-hidden />
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Format toggle — segmented, the active option lifts onto the surface. */}
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          {TYPES.map(({ key, label, Icon }) => {
            const active = type === key
            return (
              <button
                key={key || 'all'}
                type="button"
                onClick={() => update({ type: key || null })}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-surface text-primary-strong shadow-sm' : 'text-muted hover:text-text'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Sort — ordering, not a facet, so a labelled native select stays clearest. */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface pl-2.5">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="cursor-pointer rounded-r-lg bg-transparent py-2 pr-2 text-sm font-medium text-muted focus:outline-none"
            aria-label="Sort circles"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

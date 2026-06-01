'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search, MapPin, Globe, Users } from 'lucide-react'

type Interest = { id: string; name: string }

const SORTS = [
  { key: 'nearest', label: 'Nearest' },
  { key: 'active', label: 'Busiest' },
  { key: 'new', label: 'Newest' },
  { key: 'open', label: 'Open spots' },
] as const

// Faceted command bar for the Circles surface. Everything is URL-driven so a
// filtered view (type + interest + sort + search) is shareable and the page
// stays a server component. "Nearest" is resolved client-side by the near-you
// list; the others are server sorts.
export function CirclesToolbar({ interests }: { interests: Interest[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const type = params.get('type') ?? ''
  const interest = params.get('interest') ?? ''
  const sort = params.get('sort') ?? 'nearest'
  const [q, setQ] = useState(params.get('q') ?? '')

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k)
      else sp.set(k, v)
    }
    router.push(`${pathname}?${sp.toString()}`)
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary-bg text-primary-strong'
        : 'text-muted hover:bg-surface-elevated hover:text-text'
    }`

  return (
    <div className="space-y-3">
      {/* Search + interest + sort on one row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            update({ q: q.trim() || null })
          }}
          className="relative flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search circles by name, place, or interest…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-bg"
          />
        </form>

        <div className="flex shrink-0 gap-2">
          {/* Interest */}
          <select
            value={interest}
            onChange={(e) => update({ interest: e.target.value || null })}
            className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm font-medium text-muted focus:border-primary focus:outline-none"
            aria-label="Filter by interest"
          >
            <option value="">All interests</option>
            {interests.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm font-medium text-muted focus:border-primary focus:outline-none"
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
        <button type="button" onClick={() => update({ type: null })} className={pill(!type).replace('hover:bg-surface-elevated', 'hover:bg-surface')}>
          <Users className="h-3.5 w-3.5" /> All
        </button>
        <button type="button" onClick={() => update({ type: 'in-person' })} className={pill(type === 'in-person').replace('hover:bg-surface-elevated', 'hover:bg-surface')}>
          <MapPin className="h-3.5 w-3.5" /> In person
        </button>
        <button type="button" onClick={() => update({ type: 'online' })} className={pill(type === 'online').replace('hover:bg-surface-elevated', 'hover:bg-surface')}>
          <Globe className="h-3.5 w-3.5" /> Online
        </button>
      </div>
    </div>
  )
}

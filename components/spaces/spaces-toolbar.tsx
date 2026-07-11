'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, Check } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'
import { DIRECTORY_TYPES } from './space-type'
import { SpacesSort } from './spaces-sort'
import { SPACE_CATEGORIES } from '@/lib/spaces/categories'

// The command bar for the Spaces directory — the same standard the Circles/People directories use:
// a debounced free-text search (DirectorySearch), a low-cardinality TYPE filter (Business / Non
// Profit), the "business style" CATEGORY filter (the six SPACE_CATEGORIES + All), and a "Following"
// pill that narrows to the Spaces the viewer follows. Everything is URL-driven (writes the `q` /
// `type` / `category` / `following` / `sort` params, preserves the rest), so the page stays a Server
// Component and a filtered view is shareable. URL state IS the filter; no local state.
//
// Layout: the SORT control sits on its own row ABOVE the search box (item 6). Keeping it out of the
// horizontally-scrolling facet rows also fixes the dropdown that used to be clipped by an
// `overflow-x-auto` ancestor (item 5) — its menu now opens over the grid, not behind it.
export function SpacesToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const type = params.get('type') ?? ''
  const category = params.get('category') ?? ''
  const following = params.get('following') === '1'

  function setParam(key: string, next: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (next) sp.set(key, next)
    else sp.delete(key)
    // Any facet change resets paging — the current page number is meaningless against a new result set.
    sp.delete('page')
    const s = sp.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  function toggleFollowing() {
    setParam('following', following ? null : '1')
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface hover:text-text'
    }`

  return (
    <div className="space-y-3">
      {/* SORT — its own row above the search box (item 6). Not inside an overflow-clipping container,
          so the open menu sits above the grid + hero (item 5). Right-aligned as the ordering control. */}
      <div className="flex justify-end">
        <SpacesSort />
      </div>

      <DirectorySearch placeholder="Search Spaces by name…" />

      {/* Facet row 1: the low-cardinality TYPE pills (Business / Non Profit) plus a standalone
          "Following" pill. The row scrolls horizontally on a narrow screen rather than wrapping. */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1">
        <div className="flex w-max items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          <button type="button" onClick={() => setParam('type', null)} className={pill(!type)}>
            <LayoutGrid className="h-3.5 w-3.5" /> All
          </button>
          {DIRECTORY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setParam('type', t.value)}
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

      {/* Facet row 2: the CATEGORY filter — the six "business style" browse categories plus All
          (URL `?category=`), matching the type-pill idiom. Combines with type + Following. */}
      <div className="-mx-1 flex items-center overflow-x-auto px-1">
        <div className="flex w-max items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          <button type="button" onClick={() => setParam('category', null)} className={pill(!category)}>
            <LayoutGrid className="h-3.5 w-3.5" /> All
          </button>
          {SPACE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setParam('category', c.key)}
              className={pill(category === c.key)}
            >
              <c.Icon className="h-3.5 w-3.5" /> {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

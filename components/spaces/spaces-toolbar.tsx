'use client'

import type { ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, Check } from 'lucide-react'
import { DirectorySearch } from '@/components/ui/directory-search'
import { SpacesSort } from './spaces-sort'
import { SPACE_CATEGORIES } from '@/lib/spaces/categories'

// The command bar for the Spaces directory — the same standard the Circles/People directories use.
// Everything is URL-driven (writes the `q` / `category` / `following` / `sort` params, preserves the
// rest), so the page stays a Server Component and a filtered view is shareable. URL state IS the
// filter; no local state.
//
// Layout: ROW 1 is the search box (flex-1) with the SORT control and the "Following" toggle as
// matched-height siblings to its right; the search is the first thing under the hero. ROW 2 is the
// single CATEGORY filter — the SPACE_CATEGORIES labels (rendered from the source of truth) plus All,
// wired to `?category=`. The type filter (Business / Non Profit) was retired here (ADR-552); Spaces
// are browsed by category, not by public type.
export function SpacesToolbar({
  showFollowing = true,
  showSearch = true,
  columns,
}: {
  showFollowing?: boolean
  showSearch?: boolean
  /** The card-density control (MarketplaceColumns), trailing right of the category row — the same
   *  placement the Classifieds / Events surfaces use. Omit to hide it (the public directory). */
  columns?: ReactNode
} = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

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
      {/* ROW 1 — search first under the hero, with Sort + Following as matched-height siblings. The
          search grows (flex-1); Sort and Following are fixed-height boxes. `items-stretch` + `h-full`
          on the box children equalizes their height to the search input. The Sort menu opens over the
          grid (row 1 has no overflow clip), fixing the old clipped-dropdown case. */}
      <div className="flex items-stretch gap-2">
        {showSearch ? (
          <div className="min-w-0 flex-1">
            <DirectorySearch placeholder="Search Spaces by name…" />
          </div>
        ) : (
          // Search lives elsewhere (e.g. in the hero on the public directory); keep Sort pushed right.
          <div className="min-w-0 flex-1" aria-hidden />
        )}

        {/* Sort — the ordering control. Its inner trigger button is stretched to the row height. */}
        <div className="shrink-0 [&>div]:h-full [&_button]:h-full">
          <SpacesSort />
        </div>

        {/* Following — narrows to the Spaces the viewer follows (URL `?following=1`). Styled as a
            bordered box to match the Sort control on the row. Hidden on the PUBLIC directory, where a
            logged-out visitor follows nothing (showFollowing=false). */}
        {showFollowing && (
          <button
            type="button"
            onClick={toggleFollowing}
            aria-pressed={following}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors ${
              following
                ? 'border-primary bg-primary-bg text-primary-strong'
                : 'border-border bg-surface text-muted hover:border-primary hover:text-text'
            }`}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            Following
          </button>
        )}
      </div>

      {/* ROW 2 — the single CATEGORY filter (URL `?category=`) on the left, with the card-density
          `columns` control trailing right (the Classifieds / Events grammar: tabs left, density right).
          The category strip scrolls horizontally on a narrow screen; the density control stays fixed
          beside it. Labels come from the SPACE_CATEGORIES source of truth, never hardcoded. */}
      <div className="flex items-center justify-between gap-3">
        <div className="-mx-1 flex min-w-0 items-center overflow-x-auto px-1">
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
        {columns && <div className="shrink-0">{columns}</div>}
      </div>
    </div>
  )
}

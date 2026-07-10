'use client'

import { createContext, useContext, useState, Children, isValidElement, type ReactNode } from 'react'
import { Search } from 'lucide-react'

// INSTANT marketplace search. The hero search bar writes to a client context and the grids read it,
// so results filter on the very first keystroke with NO server round-trip and no debounce. Cards stay
// server-rendered (ProductCard / ListingCard / the classifieds Card) — the grid just filters the
// already-rendered children by index against a parallel `items` text array. Preserves the SSR list as
// the source of truth; search is a pure client refinement over it.

const MarketSearchCtx = createContext<{ query: string; setQuery: (q: string) => void }>({
  query: '',
  setQuery: () => {},
})

/** Wrap a marketplace page so its hero search bar and its grid(s) share one query. */
export function MarketSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  return <MarketSearchCtx.Provider value={{ query, setQuery }}>{children}</MarketSearchCtx.Provider>
}

/** The current lowercased, trimmed query. Grids call this to filter. */
export function useMarketQuery(): string {
  return useContext(MarketSearchCtx).query
}

/** Does this searchable text match the current query? (empty query matches everything). */
export function marketMatch(text: string, query: string): boolean {
  return !query || text.toLowerCase().includes(query)
}

/** The instant search bar for a MarketHero. Sets the shared query on every keystroke (no debounce,
 *  no URL write) so the grid repaints immediately. Light input styled to sit over the dark hero. */
export function MarketSearchBar({ placeholder = 'Search' }: { placeholder?: string }) {
  const { query, setQuery } = useContext(MarketSearchCtx)
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value.trim().toLowerCase())}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-white/40 bg-white/95 py-3 pl-11 pr-4 text-sm text-ink shadow-lg outline-none placeholder:text-ink/50 focus:border-primary focus:ring-2 focus:ring-primary/40"
      />
    </div>
  )
}

/** A flat card grid that instant-filters its children by the shared query. `items[i].text` is the
 *  searchable string for `children[i]` (same order). Renders `empty` when the query hides everything. */
export function InstantGrid({
  items,
  children,
  className,
  empty,
}: {
  items: { text: string }[]
  children: ReactNode
  className: string
  empty?: ReactNode
}) {
  const query = useMarketQuery()
  const nodes = Children.toArray(children).filter(isValidElement)
  const shown = nodes.filter((_, i) => marketMatch(items[i]?.text ?? '', query))
  if (shown.length === 0 && query) {
    return <>{empty ?? <p className="text-sm text-muted">No matches for &ldquo;{query}&rdquo;.</p>}</>
  }
  return <div className={className}>{shown}</div>
}

/** A titled Market section (a type group) that instant-filters its grid AND hides the whole section
 *  (header + "See all") when the query leaves it with nothing. */
export function InstantSection({
  title,
  seeAllHref,
  items,
  children,
  className,
}: {
  title: string
  seeAllHref?: string
  items: { text: string }[]
  children: ReactNode
  className: string
}) {
  const query = useMarketQuery()
  const nodes = Children.toArray(children).filter(isValidElement)
  const shown = nodes.filter((_, i) => marketMatch(items[i]?.text ?? '', query))
  if (shown.length === 0) return null
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">{title}</h2>
        {seeAllHref && (
          <a href={seeAllHref} className="text-sm font-medium text-primary-strong hover:underline">
            See all
          </a>
        )}
      </div>
      <div className={className}>{shown}</div>
    </section>
  )
}

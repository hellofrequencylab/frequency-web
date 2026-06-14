import { DirectorySearch } from '@/components/ui/directory-search'
import { FacetDropdown, type FacetOption } from '@/components/ui/facet-dropdown'
import { EventsSort, type SortOption } from './events-sort'

// The Catalog toolbar (EVENTS-DESIGN §3.1 / §3.5). One scannable row of
// discovery controls: free-text search, the facet dropdowns, and the sort menu.
// Presentational + server-friendly — it only arranges the (individually
// URL-driven) client controls, so the page stays a Server Component. Each control
// writes/clears its own search param and preserves the rest, so the whole view is
// shareable.
//
// Responsive: on a narrow screen the search takes the full first row and the
// facets + sort wrap beneath it; from `sm` up the search shrinks to sit inline
// with the facets (§3.5).

export type CatalogFacet = {
  label: string
  paramKey: string
  options: FacetOption[]
  /** Render only when true (e.g. Distance needs a home location set). */
  show?: boolean
}

export function EventsFilterBar({
  facets,
  sortOptions,
  showSearch = true,
}: {
  facets: CatalogFacet[]
  sortOptions: SortOption[]
  showSearch?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {showSearch && (
        <div className="w-full sm:w-56 sm:shrink-0">
          <DirectorySearch paramKey="q" placeholder="Search events" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {facets
          .filter((f) => f.show !== false)
          .map((f) => (
            <FacetDropdown key={f.paramKey} label={f.label} paramKey={f.paramKey} options={f.options} />
          ))}
      </div>
      <div className="sm:ml-auto">
        <EventsSort options={sortOptions} />
      </div>
    </div>
  )
}

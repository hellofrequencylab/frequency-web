import type { FacetOption } from '@/components/ui/facet-dropdown'

// Data shared by the live Frequency and marketplace event surfaces.
export type CatalogFacet = {
  label: string
  paramKey: string
  options: FacetOption[]
  /** Render only when true (e.g. Distance needs a home location set). */
  show?: boolean
}

export type SortOption = { value: string; label: string }

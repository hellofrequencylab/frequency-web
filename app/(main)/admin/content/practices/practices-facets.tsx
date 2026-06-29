import { FacetDropdown, type FacetOption } from '@/components/ui/facet-dropdown'
import {
  PracticeFlagFilters,
  PracticeComputedFilters,
  PracticeClearFilters,
} from './practices-controls'
import { PracticesFilterDisclosure } from './practices-filter-bar'

// The library's filters, as a collapsible HORIZONTAL bar ABOVE the table (not a left rail).
//
// Why this changed (owner fix, ADR-438): the facets used to live in a 15rem left column beside the
// table, inside the admin main content (which is already flanked by the left nav AND the global
// admin info rail). Three columns squeezing one 8-column table made the cells collide
// ("SystStandard", "DanlanFlyack"). Moving the filters into this full-width disclosure frees the
// whole main column for the table, which then fits and degrades to x-scroll on narrow widths
// (practices-table.tsx). Everything stays URL-driven: we only restructure the container, the
// controls (practices-controls.tsx) and their search-param logic are unchanged. A facet with no
// options is hidden so the bar never shows a dead control.
//
// Counts are GLOBAL over the admin-visible library by design (lib/practices.ts + PRACTICE-LIBRARY
// §5): they answer "what's in the library"; the "showing N of M" line reflects the active filter.

export interface FacetRailData {
  pillar: FacetOption[]
  subcategory: FacetOption[]
  status: FacetOption[]
  weight: FacetOption[]
  creator: FacetOption[]
  tag: FacetOption[]
  computed: { no_image: number; no_body: number; never_logged: number; no_pillar: number }
}

function FacetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {children}
    </div>
  )
}

export function PracticesFacets({ data }: { data: FacetRailData }) {
  // The count of active dropdowns drives the disclosure's summary; flags/computed/quick chips are
  // counted client-side in the disclosure (they read the URL). The dropdowns are rendered here.
  return (
    <PracticesFilterDisclosure clear={<PracticeClearFilters />}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <FacetGroup label="Quick filters">
          <PracticeFlagFilters />
        </FacetGroup>

        {data.pillar.length > 0 && (
          <FacetGroup label="Pillar">
            <FacetDropdown label="Any Pillar" paramKey="pillar" options={data.pillar} />
          </FacetGroup>
        )}

        {data.subcategory.length > 0 && (
          <FacetGroup label="Channel">
            <FacetDropdown label="Any Channel" paramKey="sub" options={data.subcategory} />
          </FacetGroup>
        )}

        {data.status.length > 0 && (
          <FacetGroup label="Status">
            <FacetDropdown label="Any status" paramKey="status" options={data.status} />
          </FacetGroup>
        )}

        {data.weight.length > 0 && (
          <FacetGroup label="Weight class">
            <FacetDropdown label="Any weight" paramKey="weight" options={data.weight} />
          </FacetGroup>
        )}

        {data.creator.length > 0 && (
          <FacetGroup label="Creator">
            <FacetDropdown label="Any creator" paramKey="creator" options={data.creator} searchable />
          </FacetGroup>
        )}

        {data.tag.length > 0 && (
          <FacetGroup label="Tag">
            <FacetDropdown label="Any tag" paramKey="tag" options={data.tag} searchable />
          </FacetGroup>
        )}

        <FacetGroup label="Gaps to fix">
          <PracticeComputedFilters counts={data.computed} />
        </FacetGroup>
      </div>
    </PracticesFilterDisclosure>
  )
}

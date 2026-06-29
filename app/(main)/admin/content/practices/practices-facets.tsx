import { FacetDropdown, type FacetOption } from '@/components/ui/facet-dropdown'
import {
  PracticeFlagFilters,
  PracticeComputedFilters,
  PracticeClearFilters,
} from './practices-controls'

// The in-page facet rail for the practice library (PRACTICE-LIBRARY §5 + §7). Admin routes are
// rail='none' in page-chrome, so this is NOT the shell rail — it's a left column inside the page
// body, URL-param driven so the whole page stays server-rendered and a filtered view is a
// shareable link. Every option is resolved to a real label here (the facet counts come back keyed
// by id/slug); a facet with no options is hidden so the rail never shows a dead control.
//
// Counts are GLOBAL over the admin-visible library by design (documented in lib/practices.ts +
// PRACTICE-LIBRARY §5): they answer "what's in the library", and the "showing N of M" line
// reflects the active filter. We append the count to each option label so the operator sees the
// size of each bucket.

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
    <div className="space-y-1.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {children}
    </div>
  )
}

export function PracticesFacets({ data }: { data: FacetRailData }) {
  return (
    <aside aria-label="Library filters" className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight text-text">Filters</h2>
        <PracticeClearFilters />
      </div>

      <FacetGroup label="Flags">
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
    </aside>
  )
}

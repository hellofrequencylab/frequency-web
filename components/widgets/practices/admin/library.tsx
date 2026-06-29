import { BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { getAdminPracticesContext } from '@/lib/admin/practices-context'
import { PracticesTable } from '@/app/(main)/admin/content/practices/practices-table'
import { PracticesFacets } from '@/app/(main)/admin/content/practices/practices-facets'
import {
  PracticeSearchBox,
  PracticeSortControl,
  PracticeSavedViews,
} from '@/app/(main)/admin/content/practices/practices-controls'

// Admin practices layout module (ADR-270/294): the faceted LIBRARY — the filter disclosure +
// search/sort toolbar + the management table + server pagination. Like the member /practices
// library, it's URL-driven: filters / sort / cursor / page live in the page's searchParams, which
// never reach a nested module. They reach it through the shared context (lib/admin/practices-
// context.ts), which reads the `x-search` request header the proxy stamps on every route — the
// SAME seam the member library uses (the §D faceted-library nuance: threading is clean, so the
// library converts to a module rather than staying hand-rendered in the page). The toolbar controls
// (search box · sort · saved views) WRITE those params; this block reads the resolved result.
export async function PracticeAdminLibrary() {
  const { library } = await getAdminPracticesContext()
  const { rows, filter, total, showingFrom, showingTo, pagination, facetRail, hasActiveFilter } = library

  return (
    // The library — the filters live in a full-width disclosure ABOVE the table (owner fix,
    // ADR-438), so the table gets the whole main column and the cells never collide. Everything
    // stays URL-driven; the table degrades to x-scroll on narrow widths.
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PracticeSearchBox />
        <PracticeSortControl />
        <PracticeSavedViews />
      </div>

      <PracticesFacets data={facetRail} />

      <div className="min-w-0">
        {rows.length === 0 ? (
          <EmptyState
            variant={hasActiveFilter ? 'no-results' : 'first-use'}
            icon={hasActiveFilter ? undefined : BookOpen}
            title={hasActiveFilter ? 'No practices match these filters' : 'No practices yet'}
            description={
              hasActiveFilter
                ? 'Try removing a filter, or clear them all to see the whole library.'
                : 'Practices appear here as the library fills in.'
            }
          />
        ) : (
          <PracticesTable
            rows={rows}
            filter={filter}
            total={total}
            showingFrom={showingFrom}
            showingTo={showingTo}
            pagination={pagination}
          />
        )}
      </div>
    </section>
  )
}

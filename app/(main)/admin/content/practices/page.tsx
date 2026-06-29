import Link from 'next/link'
import { BookOpen, Inbox, Star, Globe, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { searchAdminPractices, searchAdminFacets } from '@/lib/practices'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'
import { PracticeReviewButtons } from '../content-controls'
import { PracticesTable } from './practices-table'

// Library curation: the ranked practice library with visibility, template, and
// feature controls, plus the review queue for member proposals. Phase 1 (ADR-438):
// the data source is the server keyset/facet layer (searchAdminPractices), past the
// old 200-row cap. The pending review queue is its own status-filtered query; the
// library is the rest, default (score) sort, first page. Counts come from the facet rail.

// The library table is a bounded operator page (the facet rail + keyset cursor drive
// "load more" in the Phase-1 UI rebuild); a generous first page keeps the current
// single-screen table working until that lands.
const LIBRARY_PAGE_SIZE = 100

export default async function AdminContentPracticesPage() {
  await requireAdmin('host', { staff: 'community' })

  const [pendingResult, libraryResult, facets] = await Promise.all([
    searchAdminPractices({ status: 'pending', sort: 'new', pageSize: LIBRARY_PAGE_SIZE, includeHidden: true }),
    searchAdminPractices({ sort: 'score', pageSize: LIBRARY_PAGE_SIZE, includeHidden: true }),
    searchAdminFacets({ includeHidden: true }),
  ])
  const pending = pendingResult.rows
  // The library view excludes the pending queue (shown separately above).
  const library = libraryResult.rows.filter((p) => p.status !== 'pending')
  const totalInLibrary = libraryResult.total
  const publicCount = facets.flag.public
  const featuredCount = facets.flag.featured

  return (
    <AdminTemplate
      title="Practices"
      eyebrow="Content"
      description="The practice library, ranked by real usage. Tune what is public, what is a starter template, and what gets featured."
      width="wide"
      actions={<NewPracticeButton label="Add practice" />}
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="In the library" value={totalInLibrary} icon={BookOpen} href="/practices" />
          <StatCard label="Public" value={publicCount} icon={Globe} />
          <StatCard label="Awaiting review" value={pendingResult.total} icon={Inbox} />
          <StatCard label="Featured" value={featuredCount} icon={Star} />
        </div>
      </AdminSection>

      <AdminSection
        title={`Review queue (${pendingResult.total})`}
        description="Member-proposed practices waiting for a decision."
      >
        {pending.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing waiting"
            description="New member proposals land here for a decision."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {pending.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/practices/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                      <span className="truncate">{p.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      by {p.creator?.display_name ?? p.creator?.handle ?? 'Unknown'} · {p.adopters} adopters · {p.logs_total} logs
                    </p>
                  </div>
                  <PracticeReviewButtons id={p.id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      <AdminSection
        title={`Library (${totalInLibrary})`}
        description="Search, filter, and sort by any signal. The Public switch flips every row in view. Select rows for bulk weight, visibility, and template changes."
      >
        {library.length === 0 ? (
          <EmptyState variant="first-use" icon={BookOpen} title="No practices yet" description="Practices appear here as the library fills in." />
        ) : (
          <PracticesTable
            rows={library.map((p) => ({
              id: p.id,
              title: p.title,
              creator: p.creator?.display_name ?? p.creator?.handle ?? 'System',
              status: p.status ?? 'approved',
              adopters: p.adopters,
              logs_30d: p.logs_30d,
              logs_total: p.logs_total,
              score: p.score,
              created_at: p.created_at,
              is_public: p.is_public,
              is_template: p.is_template,
              featured: !!p.featured_at,
              weight_class: p.weight_class ?? null,
            }))}
          />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}

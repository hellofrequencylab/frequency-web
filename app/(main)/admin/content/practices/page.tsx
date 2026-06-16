import Link from 'next/link'
import { BookOpen, Inbox, Star, Globe, ExternalLink, Plus } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { rankedPractices } from '@/lib/admin/content-signals'
import { PracticeReviewButtons } from '../content-controls'
import { PracticesTable } from './practices-table'

// Library curation: the ranked practice library with visibility, template, and
// feature controls, plus the review queue for member proposals.

export default async function AdminContentPracticesPage() {
  await requireAdmin('host', { staff: 'community' })

  const practices = await rankedPractices()
  const pending = practices.filter((p) => p.status === 'pending')
  const library = practices.filter((p) => p.status !== 'pending')
  const publicCount = practices.filter((p) => p.is_public).length
  const featuredCount = practices.filter((p) => p.featured_at).length

  return (
    <AdminTemplate
      title="Practices"
      eyebrow="Content"
      description="The practice library, ranked by real usage. Tune what is public, what is a starter template, and what gets featured."
      width="wide"
      actions={
        <Link
          href="/admin/content/practices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> Add practice
        </Link>
      }
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="In the library" value={practices.length} icon={BookOpen} href="/practices" />
          <StatCard label="Public" value={publicCount} icon={Globe} />
          <StatCard label="Awaiting review" value={pending.length} icon={Inbox} />
          <StatCard label="Featured" value={featuredCount} icon={Star} />
        </div>
      </AdminSection>

      <AdminSection
        title={`Review queue (${pending.length})`}
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
        title={`Library (${library.length})`}
        description="Sort by any stat; the header switches flip Public or Template for the whole library at once."
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

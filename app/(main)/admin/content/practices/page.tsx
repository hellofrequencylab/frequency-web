import Link from 'next/link'
import { BookOpen, Inbox, Star, Globe, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { rankedPractices } from '@/lib/admin/content-signals'
import {
  PracticeReviewButtons,
  PracticeFeatureToggle,
  PracticePublicToggle,
  PracticeTemplateToggle,
} from '../content-controls'

// Library curation: the ranked practice library with visibility, template, and
// feature controls, plus the review queue for member proposals.

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-signal/10 text-signal' },
  approved: { label: 'Approved', cls: 'bg-success/10 text-success' },
  rejected: { label: 'Rejected', cls: 'bg-danger-bg text-danger' },
  draft: { label: 'Draft', cls: 'bg-border/60 text-muted' },
}

export default async function AdminContentPracticesPage() {
  await requireAdmin('host', { staff: 'community' })

  const practices = await rankedPractices()
  const pending = practices.filter((p) => p.status === 'pending')
  const library = practices.filter((p) => p.status !== 'pending')
  const publicCount = practices.filter((p) => p.is_public).length
  const featuredCount = practices.filter((p) => p.featured_at).length

  return (
    <AdminPage
      title="Practices"
      eyebrow="Content"
      description="The practice library, ranked by real usage. Tune what is public, what is a starter template, and what gets featured."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="In the library" value={practices.length} icon={BookOpen} />
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
          <p className="text-sm text-muted">Nothing waiting. New proposals land here.</p>
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
        description="Ranked by adopters and recent logs. Public puts it in the open library; Template makes it a claimable starter."
      >
        {library.length === 0 ? (
          <EmptyState icon={BookOpen} title="No practices yet" description="Practices appear here as the library fills in." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="hidden border-b border-border px-4 py-2 lg:grid lg:grid-cols-[1fr_120px_190px_90px_80px_80px_64px] lg:items-center lg:gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Practice</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Creator</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Signal</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Status</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Public</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Template</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Feature</span>
            </div>
            <div className="divide-y divide-border/50">
              {library.map((p) => {
                const st = p.status ? STATUS_STYLES[p.status] ?? STATUS_STYLES.draft : STATUS_STYLES.approved
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_120px_190px_90px_80px_80px_64px]"
                  >
                    <div className="min-w-0">
                      <Link href={`/practices/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                        <span className="truncate">{p.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                      </Link>
                      <span className="mt-0.5 block text-xs text-subtle lg:hidden">
                        {p.adopters} adopters · {p.logs_30d} logs in 30d
                      </span>
                    </div>
                    <span className="hidden truncate text-xs text-muted lg:block">
                      {p.creator?.display_name ?? p.creator?.handle ?? 'System'}
                    </span>
                    <span className="hidden text-xs tabular-nums text-muted lg:block">
                      {p.adopters} adopters · {p.logs_30d} in 30d · {p.logs_total} total
                    </span>
                    <span className={`hidden w-fit items-center rounded-md px-2 py-0.5 text-xs font-semibold lg:inline-flex ${st.cls}`}>
                      {st.label}
                    </span>
                    <div className="hidden justify-center lg:flex">
                      <PracticePublicToggle id={p.id} isPublic={p.is_public} />
                    </div>
                    <div className="hidden justify-center lg:flex">
                      <PracticeTemplateToggle id={p.id} isTemplate={p.is_template} />
                    </div>
                    <div className="flex justify-center">
                      <PracticeFeatureToggle id={p.id} featured={!!p.featured_at} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </AdminSection>
    </AdminPage>
  )
}

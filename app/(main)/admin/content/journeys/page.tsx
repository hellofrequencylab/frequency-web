import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Map, BookOpen, Users, Inbox, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankedJourneys } from '@/lib/admin/content-signals'
import {
  JourneyReviewButtons,
  JourneyRestoreButton,
  JourneyOfficialControl,
  JourneyFeatureToggle,
} from '../content-controls'

// The Journey curation surface (absorbs the old /admin/quests): the review
// queue for member submissions on top, then the full public library with the
// official mark, Quest link, and feature star.

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-signal/10 text-signal' },
  approved: { label: 'Approved', cls: 'bg-success/10 text-success' },
  rejected: { label: 'Rejected', cls: 'bg-danger-bg text-danger' },
  draft: { label: 'Draft', cls: 'bg-border/60 text-muted' },
}

export default async function AdminContentJourneysPage() {
  await requireAdmin('host', { staff: 'community' })

  const admin = createAdminClient()
  const ub = admin as unknown as SupabaseClient

  const [journeys, { count: officialCount }, { count: adoptionCount }, { data: questRows }] =
    await Promise.all([
      rankedJourneys(),
      admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
      admin.from('journey_plan_adoptions').select('id', { count: 'exact', head: true }).eq('active', true),
      ub.from('quests').select('id, name').eq('status', 'active').order('sort_order'),
    ] as const)

  const quests = (questRows ?? []) as { id: string; name: string }[]
  const pending = journeys.filter((j) => j.status === 'pending')
  const library = journeys.filter((j) => j.status !== 'pending')

  return (
    <AdminPage
      title="Journeys"
      eyebrow="Content"
      description="The open Journey library. Review member submissions, mark Journeys official under a Quest, and feature the best."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="In the library" value={journeys.length} icon={BookOpen} />
          <StatCard label="Awaiting review" value={pending.length} icon={Inbox} />
          <StatCard label="Official" value={officialCount ?? 0} icon={Map} />
          <StatCard label="Active adoptions" value={adoptionCount ?? 0} icon={Users} />
        </div>
      </AdminSection>

      <AdminSection
        title={`Review queue (${pending.length})`}
        description="Member-submitted Journeys waiting for a decision."
      >
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. New submissions land here.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {pending.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/journeys/${j.slug}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                      {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
                      <span className="truncate">{j.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      by {j.author?.display_name ?? j.author?.handle ?? 'Unknown'} · {j.adopt_count} adopted · {j.forked_count} remixed
                    </p>
                  </div>
                  <JourneyReviewButtons id={j.id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      <AdminSection
        title={`Journey library (${library.length})`}
        description="Public Journeys ranked by performance. The Official switch files a Journey under a Quest."
      >
        {library.length === 0 ? (
          <EmptyState icon={BookOpen} title="No journeys yet" description="Journeys published by members will appear here." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="hidden border-b border-border px-4 py-2 lg:grid lg:grid-cols-[1fr_120px_150px_90px_170px_64px_80px] lg:items-center lg:gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Journey</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Author</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Signal</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Status</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Official</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Feature</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Review</span>
            </div>
            <div className="divide-y divide-border/50">
              {library.map((j) => {
                const st = STATUS_STYLES[j.status] ?? STATUS_STYLES.draft
                return (
                  <div
                    key={j.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_120px_150px_90px_170px_64px_80px]"
                  >
                    <div className="min-w-0">
                      <Link href={`/journeys/${j.slug}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                        {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
                        <span className="truncate">{j.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                      </Link>
                      <span className="mt-0.5 block text-xs text-subtle lg:hidden">
                        {j.adopt_count} adopted · {j.forked_count} remixed
                      </span>
                    </div>
                    <span className="hidden truncate text-xs text-muted lg:block">
                      {j.author?.display_name ?? j.author?.handle ?? 'Unknown'}
                    </span>
                    <span className="hidden text-xs tabular-nums text-muted lg:block">
                      {j.adopt_count} adopted · {j.active_adoptions} active · {j.forked_count} remixed
                    </span>
                    <span className={`hidden w-fit items-center rounded-md px-2 py-0.5 text-xs font-semibold lg:inline-flex ${st.cls}`}>
                      {st.label}
                    </span>
                    <div className="hidden lg:block">
                      <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />
                    </div>
                    <div className="flex justify-center">
                      <JourneyFeatureToggle id={j.id} featured={!!j.featured_at} />
                    </div>
                    <div className="hidden justify-center lg:flex">
                      {j.status === 'rejected' && <JourneyRestoreButton id={j.id} />}
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

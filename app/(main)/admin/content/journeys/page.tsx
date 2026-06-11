import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Map, BookOpen, Users, Inbox, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankedJourneys } from '@/lib/admin/content-signals'
import type { RankedJourney } from '@/lib/admin/content-signals'
import {
  JourneyReviewButtons,
  JourneyRestoreButton,
  JourneyOfficialControl,
  JourneyFeatureToggle,
} from '../content-controls'

// The Journey curation surface (absorbs the old /admin/quests) — an INDEX / TABLE
// (ADR-233 §3.3): the review queue for member submissions on top, then the full public
// library in the shared DataTable with the official mark, Quest link, and feature star.
// Status speaks through the one StatusChip vocabulary (the local STATUS_STYLES is retired).

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  draft: { tone: 'neutral', label: 'Draft' },
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

  const columns: ColumnDef<RankedJourney>[] = [
    {
      key: 'title',
      header: 'Journey',
      render: (j) => (
        <Link href={`/journeys/${j.slug}`} className="flex items-center gap-1.5 font-medium text-text hover:underline">
          {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
          <span className="truncate">{j.title}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
        </Link>
      ),
    },
    {
      key: 'author',
      header: 'Author',
      render: (j) => (
        <span className="truncate text-muted">{j.author?.display_name ?? j.author?.handle ?? 'Unknown'}</span>
      ),
    },
    {
      key: 'signal',
      header: 'Signal',
      render: (j) => (
        <span className="tabular-nums text-muted">
          {j.adopt_count} adopted · {j.active_adoptions} active · {j.forked_count} remixed
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => {
        const st = STATUS_TONE[j.status] ?? STATUS_TONE.draft
        return <StatusChip tone={st.tone}>{st.label}</StatusChip>
      },
    },
    {
      key: 'official',
      header: 'Official',
      render: (j) => (
        <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />
      ),
    },
    {
      key: 'feature',
      header: 'Feature',
      align: 'center',
      render: (j) => <JourneyFeatureToggle id={j.id} featured={!!j.featured_at} />,
    },
    {
      key: 'review',
      header: 'Review',
      align: 'center',
      render: (j) => (j.status === 'rejected' ? <JourneyRestoreButton id={j.id} /> : null),
    },
  ]

  return (
    <AdminTemplate
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
          <EmptyState
            variant="cleared"
            title="Nothing waiting"
            description="New member submissions land here for a decision."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {pending.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/journeys/${j.slug}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                      {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
                      <span className="truncate">{j.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
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
        <DataTable
          caption="Journey library"
          rows={library}
          getRowId={(j) => j.id}
          columns={columns}
          empty={
            <EmptyState
              variant="first-use"
              icon={BookOpen}
              title="No journeys yet"
              description="Journeys published by members will appear here."
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}

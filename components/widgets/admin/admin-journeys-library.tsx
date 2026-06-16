import Link from 'next/link'
import { BookOpen, ExternalLink } from 'lucide-react'
import { getAdminJourneysContext } from '@/lib/admin/journeys-context'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { RankedJourney } from '@/lib/admin/content-signals'
import {
  JourneyRestoreButton,
  JourneyOfficialControl,
  JourneyFeatureToggle,
} from '@/app/(main)/admin/content/content-controls'

// Admin Journeys layout module (ADR-270/294): the public library in the shared DataTable — every
// non-pending Journey ranked by performance, with the official mark (files it under a Quest), the
// feature star, and the restore control for rejected ones. Self-fetching RSC; reads the shared
// (request-cached) admin Journeys context.

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  draft: { tone: 'neutral', label: 'Draft' },
}

export async function AdminJourneysLibrary() {
  const { library, quests } = await getAdminJourneysContext()

  const columns: ColumnDef<RankedJourney>[] = [
    {
      key: 'title',
      header: 'Journey',
      render: (j) => (
        <Link
          href={`/journeys/${j.slug}`}
          className="flex items-center gap-1.5 font-medium text-text hover:underline"
        >
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
      render: (j) => <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />,
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
  )
}

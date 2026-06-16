import Link from 'next/link'
import { BookOpen, ExternalLink, Pencil } from 'lucide-react'
import { getAdminJourneysContext } from '@/lib/admin/journeys-context'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { RankedJourney } from '@/lib/admin/content-signals'
import {
  JourneyRestoreButton,
  JourneyOfficialControl,
  JourneyFeatureToggle,
  JourneyDeleteButton,
} from '@/app/(main)/admin/content/content-controls'

// Admin Journeys layout module (ADR-270/294/295): the public library as a responsive card list —
// every non-pending Journey ranked by performance, with the official mark (files it under a Quest),
// the feature star, the restore control for rejected ones, and edit/delete. A flex-wrap row instead
// of a fixed DataTable so the block reflows to fit whatever slot it lands in (sidebar or full
// width) — no horizontal scroll. Self-fetching RSC; reads the shared (request-cached) context.

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  draft: { tone: 'neutral', label: 'Draft' },
}

function JourneyRow({ j, quests }: { j: RankedJourney; quests: { id: string; name: string }[] }) {
  const st = STATUS_TONE[j.status] ?? STATUS_TONE.draft
  const author = j.author?.display_name ?? j.author?.handle ?? 'Unknown'

  return (
    <li className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Identity — the flexible column; truncates rather than pushing the row wide */}
        <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
          <Link
            href={`/journeys/${j.slug}`}
            className="flex items-center gap-1.5 font-medium text-text hover:underline"
          >
            {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
            <span className="truncate">{j.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
          </Link>
          <span className="truncate text-xs tabular-nums text-muted">
            {author} · {j.adopt_count} adopted · {j.active_adoptions} active · {j.forked_count} remixed
          </span>
        </div>

        {/* Status + curation controls — wrap together beneath the title in a narrow slot */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={st.tone}>{st.label}</StatusChip>
          <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />
          <JourneyFeatureToggle id={j.id} featured={!!j.featured_at} />
          {j.status === 'rejected' ? <JourneyRestoreButton id={j.id} /> : null}
          <Link
            href={`/journeys/${j.slug}/edit`}
            title={`Edit ${j.title}`}
            aria-label={`Edit ${j.title}`}
            className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <JourneyDeleteButton id={j.id} title={j.title} />
        </div>
      </div>
    </li>
  )
}

export async function AdminJourneysLibrary() {
  const { library, quests } = await getAdminJourneysContext()

  return (
    <AdminSection
      title={`Journey library (${library.length})`}
      description="Public Journeys ranked by performance. The Official switch files a Journey under a Quest."
    >
      {library.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={BookOpen}
          title="No journeys yet"
          description="Journeys published by members will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {library.map((j) => (
            <JourneyRow key={j.id} j={j} quests={quests} />
          ))}
        </ul>
      )}
    </AdminSection>
  )
}

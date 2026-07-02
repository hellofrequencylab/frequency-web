import { CheckCircle2, XCircle, Play } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getPlaybookActivity, type PlaybookRunRow } from '@/lib/playbooks/overview'
import type { PlaybookRunStatus } from '@/lib/playbooks/runs'

// Playbooks layout module (ADR-270/294): the recent run history — what ran lately, and how it landed.
// A wave-off teaches the next night's ranking. Self-fetching + fail-safe (empty list on any error);
// shows the first-use empty until the first draft is approved on Vera Today. The page owns the staff
// gate, so the module never re-gates.
export async function CrmPlaybooksRuns() {
  const { runs } = await getPlaybookActivity()

  return (
    <AdminSection
      title="Recent runs"
      description="What ran lately, and how it landed. A wave-off teaches the next night's ranking."
    >
      {runs.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No runs yet"
          description="When a play is proposed, run, or waved off, it shows here with the outcome. The engine starts in suggest only, so the first runs appear once you approve a draft on Today."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {runs.map((run, i) => (
            <RunRow key={`${run.playbookId}-${run.startedAt ?? i}`} run={run} />
          ))}
        </ul>
      )}
    </AdminSection>
  )
}

const STATUS_PRESENT: Record<PlaybookRunStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  done: { label: 'Ran', tone: 'text-success', Icon: CheckCircle2 },
  dismissed: { label: 'Waved off', tone: 'text-subtle', Icon: XCircle },
  failed: { label: 'Failed', tone: 'text-danger', Icon: XCircle },
  proposed: { label: 'Proposed', tone: 'text-muted', Icon: Play },
}

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`
}

function RunRow({ run }: { run: PlaybookRunRow }) {
  const present = STATUS_PRESENT[run.status]
  const when = formatWhen(run.startedAt)
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <present.Icon className={`h-4 w-4 shrink-0 ${present.tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{run.playbookName}</p>
        <p className="text-xs text-muted">
          {present.label}
          {when ? ` · ${when}` : ''}
          {run.outcome ? ` · ${run.outcome}` : ''}
        </p>
      </div>
    </li>
  )
}

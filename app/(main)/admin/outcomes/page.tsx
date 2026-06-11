import { Target, Trophy, Map, CircleDot } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip } from '@/components/admin/status'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getOutcomeReport,
  type ChallengeOutcome,
  type QuestOutcome,
  type CircleOutcome,
} from '@/lib/analytics/outcomes'

// Janitor-only: program/game outcomes (ENGAGEMENT-MARKETING-ENGINE.md Phase C).
// Where members complete vs stall in challenges, Journeys, and circles — "what's
// working / what isn't." A low completion rate with real starts is the signal.
// Analytics (ADR-233 §3): StatCard KPIs + DataTables; the ad-hoc RateCell style
// retires into a tokenized StatusChip.
export const dynamic = 'force-dynamic'

// A completion rate this low, with enough starts to matter, is a friction flag.
function needsAttention(rate: number | null, started: number): boolean {
  return rate !== null && rate < 25 && started >= 3
}

// One rate cell: the share as a tokenized StatusChip (danger = friction flag, where
// completion is low but real starts exist).
function RateChip({ rate, started }: { rate: number | null; started: number }) {
  if (rate === null) return <span className="tabular-nums text-subtle">–</span>
  const flag = needsAttention(rate, started)
  return (
    <StatusChip tone={flag ? 'danger' : 'neutral'} size="sm">
      <span className="tabular-nums">{rate}%</span>
      {flag && <span>needs attention</span>}
    </StatusChip>
  )
}

export default async function OutcomesPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  const { challenges, quests, circles, circleStatus } = await getOutcomeReport()

  const flagged =
    challenges.filter((c) => needsAttention(c.rate, c.started)).length +
    quests.filter((q) => needsAttention(q.rate, q.started)).length

  const challengeColumns: ColumnDef<ChallengeOutcome>[] = [
    {
      key: 'name',
      header: 'Challenge',
      render: (c) => (
        <span className="text-text">
          {c.name}
          {c.difficulty && <span className="ml-2 text-xs text-subtle">{c.difficulty}</span>}
        </span>
      ),
    },
    { key: 'started', header: 'Started', type: 'number', render: (c) => c.started.toLocaleString() },
    { key: 'completed', header: 'Done', type: 'number', render: (c) => c.completed.toLocaleString() },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (c) => <RateChip rate={c.rate} started={c.started} />,
    },
  ]

  const questColumns: ColumnDef<QuestOutcome>[] = [
    { key: 'name', header: 'Journey', render: (q) => <span className="text-text">{q.name}</span> },
    { key: 'started', header: 'Started', type: 'number', render: (q) => q.started.toLocaleString() },
    { key: 'completed', header: 'Done', type: 'number', render: (q) => q.completed.toLocaleString() },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (q) => <RateChip rate={q.rate} started={q.started} />,
    },
    {
      key: 'avgStallStep',
      header: 'Stuck at step',
      type: 'number',
      render: (q) => q.avgStallStep ?? '–',
    },
  ]

  const circleColumns: ColumnDef<CircleOutcome>[] = [
    { key: 'name', header: 'Circle', render: (c) => <span className="truncate text-text">{c.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (c.status ? <StatusChip size="sm">{c.status}</StatusChip> : <span className="text-subtle">–</span>),
    },
    {
      key: 'fill',
      header: 'Fill',
      align: 'right',
      render: (c) => (
        <span className="tabular-nums text-text">
          {c.memberCount}
          {c.memberCap ? `/${c.memberCap}` : ''}
          {c.fillPct !== null ? ` · ${c.fillPct}%` : ''}
        </span>
      ),
    },
  ]

  return (
    <AdminTemplate
      title="Outcomes"
      eyebrow="Insights"
      icon={Target}
      description="Completion and stall points across the game and circles. A low rate with real starts is where a program is not landing."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Challenges tracked" value={challenges.length} icon={Trophy} />
          <StatCard label="Journeys tracked" value={quests.length} icon={Map} />
          <StatCard label="Member circles" value={circles.length} icon={CircleDot} />
          <StatCard
            label="Need attention"
            value={flagged}
            icon={Target}
            delta={flagged > 0 ? { label: 'low rate, real starts', trend: 'down' } : { label: 'all landing', trend: 'up' }}
          />
        </div>
      </AdminSection>

      <AdminSection title="Challenges" description="Where members complete versus stall in the season challenges.">
        <DataTable
          rows={challenges}
          getRowId={(c) => c.name}
          columns={challengeColumns}
          caption="Season challenge completion rates."
          empty={<EmptyState variant="first-use" icon={Trophy} title="No challenge activity yet" description="Completion shows up here as members start challenges." />}
        />
      </AdminSection>

      <AdminSection title="Journeys" description="Completion and the step members tend to get stuck on.">
        <DataTable
          rows={quests}
          getRowId={(q) => q.name}
          columns={questColumns}
          caption="Journey completion rates and stall steps."
          empty={<EmptyState variant="first-use" icon={Map} title="No Journey activity yet" description="Completion shows up here as members adopt Journeys." />}
        />
      </AdminSection>

      <AdminSection title="Circles" description="Member circles by fill, with the status mix across the membership.">
        {circleStatus.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {circleStatus.map((s) => (
              <StatusChip key={s.status} size="sm">
                {s.status}: <span className="tabular-nums">{s.n}</span>
              </StatusChip>
            ))}
          </div>
        )}
        <DataTable
          rows={circles}
          getRowId={(c) => c.name}
          columns={circleColumns}
          caption="Member circles by fill."
          empty={<EmptyState variant="first-use" icon={CircleDot} title="No member circles yet" description="Circles appear here as members create them." />}
        />
      </AdminSection>
    </AdminTemplate>
  )
}

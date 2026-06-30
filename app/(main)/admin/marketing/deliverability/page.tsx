import { Suspense } from 'react'
import { requireAdmin } from '@/lib/admin/guard'
import {
  countPending,
  countDeadLettered,
  summarizeDeadLettered,
  listDeadLettered,
} from '@/lib/queue/outbox'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { RequeueButton } from './requeue-button'

export const dynamic = 'force-dynamic'

// Outbox deliverability + dead-letter recovery (GE6-1). The durable outbox retries with
// backoff and parks exhausted jobs in a terminal "failed" (dead-letter) state. This is
// the surface that closes the DLQ gap: it shows the live backlog, the dead-letters by
// kind, and one-tap recovery once the cause (e.g. a Resend outage) is resolved.
export default async function DeliverabilityPage() {
  // Re-gate server-side (the page reads the admin client): marketing staff only.
  await requireAdmin('host', { staff: 'marketing' })

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Deliverability"
      description="The outbox health: the live send backlog and the dead-letter queue. Every email and push is queued, retried with backoff, and parked here if it exhausts its attempts. Requeue a dead-letter once the cause is fixed."
      width="wide"
    >
      <AdminSection title="Queue health" actions={<FreshnessNote at={new Date()} />}>
        <Suspense fallback={<KpiSkeleton n={2} />}>
          <Health />
        </Suspense>
      </AdminSection>

      <AdminSection
        title="Dead-letter queue"
        description="Jobs that exhausted every retry. They no longer drain on their own. Fix the cause, then requeue."
      >
        <Suspense fallback={<TableSkeleton rows={4} cols={4} />}>
          <DeadLetters />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

async function Health() {
  const [pending, dead] = await Promise.all([countPending(), countDeadLettered()])
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard label="Pending in queue" value={pending.toLocaleString()} />
      <StatCard label="Dead-lettered" value={dead.toLocaleString()} />
    </div>
  )
}

interface DeadRow {
  id: string
  kind: string
  attempts: string
  lastError: string | null
  updatedAt: string
}

async function DeadLetters() {
  const [summary, jobs] = await Promise.all([summarizeDeadLettered(), listDeadLettered(100)])

  if (jobs.length === 0) {
    return (
      <EmptyState
        variant="cleared"
        title="Nothing dead-lettered."
        description="Every queued send has drained or is still retrying. A clean queue is the healthy state."
      />
    )
  }

  const rows: DeadRow[] = jobs.map((j) => ({
    id: j.id,
    kind: j.kind,
    attempts: `${j.attempts}/${j.maxAttempts}`,
    lastError: j.lastError,
    updatedAt: new Date(j.updatedAt).toLocaleString(),
  }))

  const columns: ColumnDef<DeadRow>[] = [
    { key: 'kind', header: 'Kind', render: (r) => <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs text-text">{r.kind}</code> },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (r) => <span className="tabular-nums text-muted">{r.attempts}</span> },
    {
      key: 'lastError',
      header: 'Last error',
      render: (r) => <span className="text-muted line-clamp-2">{r.lastError ?? '—'}</span>,
    },
    { key: 'updatedAt', header: 'Failed at', align: 'right', render: (r) => <span className="whitespace-nowrap text-subtle">{r.updatedAt}</span> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <RequeueButton label="Requeue all" />
        {summary.map((s) => (
          <span key={s.kind} className="inline-flex items-center gap-2">
            <span className="text-xs text-muted">
              <code className="rounded bg-surface-elevated px-1 py-0.5 text-text">{s.kind}</code>: {s.count}
            </span>
            <RequeueButton kind={s.kind} label={`Requeue ${s.kind}`} />
          </span>
        ))}
      </div>
      <DataTable caption="Dead-lettered outbox jobs" rows={rows} columns={columns} getRowId={(r) => r.id} />
    </div>
  )
}

function KpiSkeleton({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-elevated/70" />
      ))}
    </div>
  )
}

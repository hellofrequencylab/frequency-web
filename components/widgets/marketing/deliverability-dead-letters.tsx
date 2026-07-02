import { summarizeDeadLettered, listDeadLettered } from '@/lib/queue/outbox'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { RequeueButton } from '@/app/(main)/admin/marketing/deliverability/requeue-button'

// Deliverability layout module (ADR-270/294): the dead-letter queue — jobs that exhausted every
// retry, grouped by kind with one-tap requeue once the cause is fixed. Self-fetching RSC; keeps its
// own "cleared" empty (a clean queue is the healthy state, so the reassurance is operator guidance,
// not noise). The requeue action re-gates server-side; the route is only reachable through the gated
// Deliverability page (marketing staff).
interface DeadRow {
  id: string
  kind: string
  attempts: string
  lastError: string | null
  updatedAt: string
}

export async function MarketingDeliverabilityDeadLetters() {
  const [summary, jobs] = await Promise.all([summarizeDeadLettered(), listDeadLettered(100)])

  if (jobs.length === 0) {
    return (
      <AdminSection
        title="Dead-letter queue"
        description="Jobs that exhausted every retry. They no longer drain on their own. Fix the cause, then requeue."
      >
        <EmptyState
          variant="cleared"
          title="Nothing dead-lettered."
          description="Every queued send has drained or is still retrying. A clean queue is the healthy state."
        />
      </AdminSection>
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
    <AdminSection
      title="Dead-letter queue"
      description="Jobs that exhausted every retry. They no longer drain on their own. Fix the cause, then requeue."
    >
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
    </AdminSection>
  )
}
